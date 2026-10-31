param(
 [string]$Workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
 [string]$EvidenceDir = ''
)
$ErrorActionPreference='Stop'
$project="$workspace/apps/wxminiprogram"
$apiRoot="$workspace/apps/api"
$fixture=Get-Content -Raw "$apiRoot/.tmp/agency-visual-private.json" | ConvertFrom-Json
$out=if($EvidenceDir){$EvidenceDir}else{"$apiRoot/.tmp/enterprise-preparation-mini-20261031"}
New-Item -ItemType Directory -Force $out | Out-Null
$argsPath="$apiRoot/.tmp/preparation-mini-args.json"
function Eval-Mini([string]$code,[object[]]$payload=@()) {
 $source=$code.Trim().Replace("'",[string][char]96)
 ConvertTo-Json -Depth 20 -InputObject $payload | Set-Content -Encoding utf8 $argsPath
 $raw=(& wechatide -c Codex automation_evaluate --project $project --fn-source $source --args-file $argsPath) -join "`n"
 $json=$raw.Substring($raw.IndexOf('{'))|ConvertFrom-Json
 if(!$json.ok -or !$json.result.success){throw $raw}
 return $json.result.result.result
}
function Nav([string]$url) {
 $null=Eval-Mini 'function(){var p=getCurrentPages(),a=p[p.length-1];if(a&&a.markFormSaved)a.markFormSaved();return true;}'
 $raw=(& wechatide -c Codex automation_navigate --project $project --action reLaunch --url $url) -join "`n"
 if($raw -notmatch '"success": true'){throw $raw}
}
function Shot([string]$name) {
 foreach($top in @(0,650)) {
  $null=Eval-Mini 'function(o){wx.pageScrollTo({scrollTop:o.top,duration:0});return true;}' @(@{top=$top})
  $raw=(& wechatide -c Codex simulator_screenshot --project $project --path "$out/$name-$top.jpg" --wait 1) -join "`n"
  if($raw -notmatch '"success": true'){throw $raw}
 }
}
$results=@()
try {
 $installed=Eval-Mini 'function(o){var a=getApp();if(a.__preparationAudit)throw Error(`audit already active`);var keys=[`joinyuu_client_token`,`joinyuu_client_profile`,`joinyuu_client_identity`,`joinyuu_mini_theme_mode`,`joinyuu_mini_theme_cache`],b={apis:{},storage:{},config:a.globalData.siteConfig,systemTheme:wx.getSystemInfoSync().theme||`light`};keys.forEach(function(k){b.storage[k]={present:wx.getStorageInfoSync().keys.indexOf(k)>=0,value:wx.getStorageSync(k)}});a.__preparationAudit=b;[`request`,`uploadFile`,`downloadFile`].forEach(function(k){b.apis[k]=wx[k];wx[k]=function(v){if(v&&typeof v.url===`string`)v.url=v.url.replace(`http://127.0.0.1:7757`,`http://127.0.0.1:17757`);return b.apis[k].call(wx,v)}});wx.setStorageSync(`joinyuu_client_token`,o.token);return {installed:true,systemTheme:b.systemTheme};}' @(@{token=$fixture.owner})
 foreach($service in @('finance-tax','business-change','license')) {
  Nav "/pkg/pages/me/enterprise-services/$service/index"
  $state=Eval-Mini 'function(){var p=getCurrentPages(),a=p[p.length-1];return a.load().then(function(){return {route:a.route,error:a.data.loadError,guide:a.data.guide};});}'
  if($state.error -or !$state.guide){throw ($state|ConvertTo-Json -Depth 7)}
  $null=(& wechatide -c Codex automation_page_action --project $project --action querySelector --selector "#preparation-card" --wait-for-selector "#preparation-card") -join "`n"
  $rect=Eval-Mini 'function(){var p=getCurrentPages(),a=p[p.length-1],c=a.selectComponent(`#preparation-card`);if(!c)throw Error(`missing preparation component`);return new Promise(function(resolve){c.selectComponent(`#guide-collapse`).createSelectorQuery().select(`.t-collapse`).boundingClientRect(function(rect){resolve(rect);}).exec();});}'
  $raw=(& wechatide -c Codex automation_element_action --project $project --action tap --x ($rect.left+$rect.width/2) --y ($rect.top+$rect.height/2)) -join "`n"
  if($raw -notmatch '"success": true'){throw $raw}
  $opened=Eval-Mini 'function(){var p=getCurrentPages(),a=p[p.length-1],c=a.selectComponent(`#preparation-card`);return {expanded:c.data.expanded};}'
  if($opened.expanded -notcontains 'preparation'){throw ('Native collapse did not expand: '+($opened|ConvertTo-Json -Compress))}
  Shot "$service-expanded"
  $variants=$state.guide.variants
  foreach($variant in $variants){
   $r=Eval-Mini 'function(o){var p=getCurrentPages(),a=p[p.length-1],g=a.data.guide,v=g.selector===`changeTypes`?[o.code]:o.code;a.setNested(g.selector,v);return new Promise(function(resolve){wx.nextTick(function(){var c=a.selectComponent(`#preparation-card`);resolve({code:o.code,variants:c.data.preparation.variants.map(function(x){return x.code}),materials:c.data.preparation.materials});});});}' @(@{code=$variant.code})
   if($r.variants -notcontains $variant.code){$late=Eval-Mini 'function(){var a=getCurrentPages().slice(-1)[0],c=a.selectComponent(`#preparation-card`);return {page:a.data.form.changeTypes,child:c.data.form.changeTypes,preparation:c.data.preparation};}';throw (($r|ConvertTo-Json -Depth 8)+($late|ConvertTo-Json -Depth 8))}
   $results+=@{service=$service;state=$r}
  }
 }
 $null=Eval-Mini 'function(){wx.setStorageSync(`joinyuu_mini_theme_mode`,`system`);wx.pageScrollTo({scrollTop:0,duration:0});return true;}'
 $raw=(& wechatide -c Codex simulator_set_darkmode --project $project --mode dark) -join "`n"
 if($raw -notmatch '"success": true'){throw $raw}
 Shot 'license-dark'
 $results|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 "$out/report.json"
 Write-Output "PASS mini preparation variants $($results.Count)"
} finally {
 $restored=Eval-Mini 'function(){var a=getApp(),b=a.__preparationAudit;if(!b)return {restored:false};Object.keys(b.apis).forEach(function(k){wx[k]=b.apis[k]});Object.keys(b.storage).forEach(function(k){var x=b.storage[k];if(x.present)wx.setStorageSync(k,x.value);else wx.removeStorageSync(k)});a.globalData.siteConfig=b.config;delete a.__preparationAudit;return {restored:true};}'
 Write-Output ($restored|ConvertTo-Json -Compress)
 if($installed.systemTheme){$null=(& wechatide -c Codex simulator_set_darkmode --project $project --mode $installed.systemTheme) -join "`n"}
 Remove-Item -LiteralPath $argsPath -ErrorAction SilentlyContinue
 Nav '/pages/home/index'
}
