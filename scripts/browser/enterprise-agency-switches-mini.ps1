# 仅用于隔离fixture17757。先按docs/workspace/browser-testing.md启动API。
param([string]$WorkspaceRoot = (Join-Path $PSScriptRoot '../..'), [string]$EvidenceDirectory = '')
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path -LiteralPath $WorkspaceRoot).Path
$project="$workspace/apps/wxminiprogram"
$apiRoot="$workspace/apps/api"
$fixture=Get-Content -Raw "$apiRoot/.tmp/agency-visual-private.json" | ConvertFrom-Json
$out=if ($EvidenceDirectory) { $EvidenceDirectory } else { "$apiRoot/.tmp/enterprise-visibility-mini" }
New-Item -ItemType Directory -Force $out | Out-Null
$argsPath="$apiRoot/.tmp/visibility-mini-args.json"
function Eval-Mini([string]$code,[object[]]$payload=@()) {
  $source=$code.Trim().Replace("'",[string][char]96)
  ConvertTo-Json -Depth 20 -InputObject $payload | Set-Content -Encoding utf8 $argsPath
  $raw=(& wechatide -c Codex automation_evaluate --project $project --fn-source $source --args-file $argsPath) -join "`n"
  $json=$raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
  if (!$json.ok -or !$json.result.success) { throw $raw }
  return $json.result.result.result
}
function Config([object]$data) {
  return (Invoke-RestMethod -Uri 'http://127.0.0.1:17757/api/admin/system/config' -Method Put -Headers @{Authorization="Bearer $($fixture.admin)"} -ContentType 'application/json; charset=utf-8' -Body (ConvertTo-Json -Depth 20 $data)).data
}
function Nav([string]$url) {
  $raw=(& wechatide -c Codex automation_navigate --project $project --action reLaunch --url $url) -join "`n"
  if ($raw -notmatch '"success": true') {throw $raw}
}
function State {
  return Eval-Mini 'function(){var p=getCurrentPages(),a=p[p.length-1];return Promise.resolve(a.onShow&&a.onShow()).then(function(){if(a.route===`pkg/pages/me/enterprise-agency/index`&&a.data.enterpriseAgencyOpen)return a.load();}).then(function(){return {route:a.route,master:a.data.enterpriseAgencyOpen,registration:a.data.enterpriseRegistrationOpen,visible:(a.data.visibleServices||[]).map(function(x){return x.key}),entries:(a.data.sections||[]).reduce(function(all,s){return all.concat(s.entries.map(function(x){return x.path}))},[]),records:(a.data.records||[]).map(function(x){return {id:x.id,service:x.serviceType}}),error:a.data.error};});}'
}
function Shot([string]$name,[int[]]$tops=@(0,650,1300)) {
  foreach($top in $tops){$null=Eval-Mini 'function(o){wx.pageScrollTo({scrollTop:o.top,duration:0});return true;}' @(@{top=$top});$raw=(& wechatide -c Codex simulator_screenshot --project $project --path "$out/$name-$top.jpg" --wait 1) -join "`n";if($raw -notmatch '"success": true'){throw $raw}}
}
$config=(Invoke-RestMethod -Uri 'http://127.0.0.1:17757/api/admin/system/config' -Headers @{Authorization="Bearer $($fixture.admin)"}).data
$originalConfigJson=ConvertTo-Json -Depth 20 $config
$records=@()
try {
 $null=Eval-Mini 'function(o){var a=getApp();if(a.__visibilityAudit)throw Error(`audit already active`);var keys=[`joinyuu_client_token`,`joinyuu_client_profile`,`joinyuu_client_identity`],b={apis:{},storage:{},config:a.globalData.siteConfig};keys.forEach(function(k){b.storage[k]={present:wx.getStorageInfoSync().keys.indexOf(k)>=0,value:wx.getStorageSync(k)}});a.__visibilityAudit=b;wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+`/visibility-audit-backup.json`,JSON.stringify(b.storage),`utf8`);[`request`,`uploadFile`,`downloadFile`].forEach(function(k){b.apis[k]=wx[k];wx[k]=function(v){if(v&&typeof v.url===`string`)v.url=v.url.replace(`http://127.0.0.1:7757`,`http://127.0.0.1:17757`);return b.apis[k].call(wx,v)}});wx.setStorageSync(`joinyuu_client_token`,o.token);return {installed:true};}' @(@{token=$fixture.owner})
 foreach($key in @('enterpriseAgencyOpen','enterpriseRegistrationOpen','enterpriseTaxOpen','enterpriseChangeOpen','enterpriseLicenseOpen')){$config.$key=$true}
 $null=Config $config
 Nav '/pages/me/index';$state=State
 if ($state.entries -notcontains '/pkg/pages/me/enterprise-agency/index'){throw 'Master on: missing profile entry'}
 Shot 'all-on-me'
 Nav '/pkg/pages/me/enterprise-agency/index';$state=State
 if($state.visible.Count -ne 3 -or !$state.registration){throw ($state|ConvertTo-Json -Depth 8)}
 Shot 'all-on-hub'
 $records+=@{case='all-on';state=$state}
 foreach($pair in @(@('enterpriseTaxOpen','finance_tax'),@('enterpriseChangeOpen','business_change'),@('enterpriseLicenseOpen','license'))){
   $config.($pair[0])=$false;$null=Config $config;$state=State
   if($state.visible -contains $pair[1] -or $state.visible.Count -ne 2){throw ($state|ConvertTo-Json -Depth 8)}
   Shot "off-$($pair[1])"
   $records+=@{case="off-$($pair[1])";state=$state}
   $config.($pair[0])=$true;$null=Config $config;$state=State
   if($state.visible.Count -ne 3){throw 'Child reopen failed'}
 }
 $config.enterpriseRegistrationOpen=$false;$null=Config $config;$state=State
 if($state.registration){throw 'Registration card remains enabled'}
 Shot 'registration-off-hub'
 foreach($intro in @('enterprise','talent')){Nav "/pkg/intro/$intro";$state=State;if($state.registration){throw 'Intro entry remains enabled'};Shot "registration-off-intro-$intro"}
 Nav '/pkg/pages/me/enterprise-agency/registration/index';$state=State
 if($state.route -ne 'pkg/pages/me/enterprise-agency/index'){throw "Registration direct link did not redirect: $($state.route)"}
 $config.enterpriseRegistrationOpen=$true;$null=Config $config
 $config.enterpriseAgencyOpen=$false;$null=Config $config
 Nav '/pkg/pages/me/enterprise-agency/index';$state=State
 # onShow may have initiated switchTab; read the actual stack again.
 $state=State
 if($state.route -ne 'pages/me/index' -or $state.entries -contains '/pkg/pages/me/enterprise-agency/index'){throw ($state|ConvertTo-Json -Depth 8)}
 Shot 'master-off-me'
 $records+=@{case='master-off';state=$state}
 Nav '/pkg/intro/enterprise';$state=State;if($state.registration){throw 'Master-off intro still active'};Shot 'master-off-intro'
 $config.enterpriseAgencyOpen=$true;$null=Config $config
 Nav '/pkg/pages/me/enterprise-agency/index';$state=State
 if($state.visible.Count -ne 3 -or !$state.registration){throw 'Master reopen did not preserve children'}
 Shot 'reopened-hub'
 $records+=@{case='reopened';state=$state}
 $records|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 "$out/report.json"
 Write-Output 'PASS mini service switches, registration intro/deep link, master redirect and reopen'
} finally {
 try { $null=Config ($originalConfigJson|ConvertFrom-Json) } finally {
 try {
 $restored=Eval-Mini 'function(){var a=getApp(),b=a.__visibilityAudit;if(!b)return {restored:false};Object.keys(b.apis).forEach(function(k){wx[k]=b.apis[k]});Object.keys(b.storage).forEach(function(k){var x=b.storage[k];if(x.present)wx.setStorageSync(k,x.value);else wx.removeStorageSync(k)});a.globalData.siteConfig=b.config;delete a.__visibilityAudit;wx.getFileSystemManager().unlinkSync(wx.env.USER_DATA_PATH+`/visibility-audit-backup.json`);return {restored:true};}'
 Write-Output ($restored|ConvertTo-Json -Compress)
 } finally {
 Remove-Item -LiteralPath $argsPath -ErrorAction SilentlyContinue
 Nav '/pages/home/index'
 }
 }
}
