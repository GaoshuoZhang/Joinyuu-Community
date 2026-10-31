param(
 [string]$Workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
 [string]$EvidenceDir = '',
 [string[]]$Services = @('finance-tax','business-change','license','registration')
)
$ErrorActionPreference='Stop'
$project="$workspace/apps/wxminiprogram"
$apiRoot="$workspace/apps/api"
$fixture=Get-Content -Raw "$apiRoot/.tmp/agency-visual-private.json" | ConvertFrom-Json
$out=if($EvidenceDir){$EvidenceDir}else{"$apiRoot/.tmp/enterprise-material-lifecycle-mini-20261031"}
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
 $raw=(& wechatide -c Codex simulator_screenshot --project $project --path "$out/$name.jpg" --wait 1) -join "`n"
 if($raw -notmatch '"success": true'){throw $raw}
}
$results=@()
try {
 $installed=Eval-Mini 'function(o){var a=getApp();if(a.__preparationAudit)throw Error(`audit already active`);var keys=[`joinyuu_client_token`,`joinyuu_client_profile`,`joinyuu_client_identity`,`joinyuu_mini_theme_mode`,`joinyuu_mini_theme_cache`],b={apis:{},storage:{},config:a.globalData.siteConfig,systemTheme:wx.getSystemInfoSync().theme||`light`};keys.forEach(function(k){b.storage[k]={present:wx.getStorageInfoSync().keys.indexOf(k)>=0,value:wx.getStorageSync(k)}});a.__preparationAudit=b;[`request`,`uploadFile`,`downloadFile`].forEach(function(k){b.apis[k]=wx[k];wx[k]=function(v){if(v&&typeof v.url===`string`)v.url=v.url.replace(`http://127.0.0.1:7757`,`http://127.0.0.1:17757`);return b.apis[k].call(wx,v)}});wx.setStorageSync(`joinyuu_client_token`,o.token);var path=wx.env.USER_DATA_PATH+`/agency-material-fixture.pdf`;wx.getFileSystemManager().writeFileSync(path,`%PDF-1.4\n% synthetic material fixture\n%%EOF`,`utf8`);b.tempPath=path;[`chooseMedia`,`chooseMessageFile`,`showActionSheet`].forEach(function(k){b.apis[k]=wx[k]});wx.showActionSheet=function(v){v.success({tapIndex:1})};wx.chooseMessageFile=wx.chooseMedia=function(v){v.success({tempFiles:[{path:path,tempFilePath:path,name:`synthetic.pdf`,size:50}]})};return {installed:true,systemTheme:b.systemTheme};}' @(@{token=$fixture.owner})
 foreach($service in @('finance-tax','business-change','license') | Where-Object { $Services -contains $_ }) {
  Nav "/pkg/pages/me/enterprise-services/$service/index"
  $state=Eval-Mini 'function(){var a=getCurrentPages().slice(-1)[0];return a.load().then(function(){return {error:a.data.loadError};});}'
  if($state.error){throw $state.error}
  $selected=Eval-Mini 'function(o){var a=getCurrentPages().slice(-1)[0];a.setNested(`company.name`,`隔离本地选材-`+o.service);a.setNested(`company.creditCode`,`91310000MA1K000000`);a.setNested(`contact.name`,`合成联系人`);a.setNested(`contact.phone`,`13800000001`);if(o.service===`finance-tax`){a.setNested(`monthlyVoucherBand`,`le10`);a.setNested(`startMonth`,`2026-01`)}else if(o.service===`business-change`){a.setNested(`changeTypes`,[`address`]);a.setNested(`address.newAddress`,`隔离社区合成地址8号`)}else{a.setNested(`region`,`隔离市测试区`);a.setNested(`principalName`,`合成负责人`);a.setNested(`premisesNote`,`合成测试场所说明`);a.setNested(`equipmentNote`,`合成测试设备说明`)}if(!a.data.form.consent)a.toggleConsent();return a.chooseFile({currentTarget:{dataset:{field:`licenseCopy`,kind:`document`}}}).then(function(){return {file:a.data.form.licenseCopy};});}' @(@{service=$service})
  if(!$selected.file.local){throw 'Selection did not stay local'}
  $response=Invoke-WebRequest -Uri "http://127.0.0.1:17757/api/app/enterprise-services/$service/files/$($selected.file.fileId)" -Headers @{Authorization="Bearer $($fixture.owner)"} -SkipHttpErrorCheck
  if($response.StatusCode -ne 404){throw 'Unsubmitted material unexpectedly exists on server'}
  $null=Eval-Mini 'function(){var a=getCurrentPages().slice(-1)[0];return new Promise(function(resolve){a.createSelectorQuery().select(`.file-card`).boundingClientRect(function(rect){if(rect)wx.pageScrollTo({scrollTop:Math.max(0,rect.top-150),duration:0});resolve(true)}).exec();});}'
  Shot "$service-local-selected"
  $null=Eval-Mini 'function(){getCurrentPages().slice(-1)[0].submit();return true;}'
  $created=$null
  for($attempt=0;$attempt -lt 20;$attempt++) {
   $current=Eval-Mini 'function(){var a=getCurrentPages().slice(-1)[0];return {id:a.data.submittedId,submitting:a.data.submitting,errors:a.data.errors};}'
   if($current.id){$created=$current.id;break}
   if(!$current.submitting){throw ($current|ConvertTo-Json -Depth 8)}
   Start-Sleep -Milliseconds 200
  }
  if(!$created){throw 'Native multipart submit timed out'}
  $detail=(Invoke-RestMethod -Uri "http://127.0.0.1:17757/api/app/enterprise-services/$service/applications/$created" -Headers @{Authorization="Bearer $($fixture.owner)"}).data
  if($detail.files.Count -ne 1 -or $detail.files[0].fileId -ne $selected.file.fileId){throw 'Submitted material metadata mismatch'}
  $download=Invoke-WebRequest -Uri "http://127.0.0.1:17757/api/app/enterprise-services/$service/files/$($selected.file.fileId)" -Headers @{Authorization="Bearer $($fixture.owner)"}
  if($download.StatusCode -ne 200){throw 'Submitted material unreadable'}
  $null=Eval-Mini 'function(){wx.pageScrollTo({scrollTop:0,duration:0});return true;}'
  Shot "$service-submitted"
  $results+=@{service=$service;id=$created;localBeforeSubmit=$true;fileAbsentBeforeSubmit=$true;fileReadableAfterSubmit=$true;status=$detail.status}
 }
 if($Services -contains 'registration') {
  $registrationId=$fixture.samples.pending.id
  $null=Invoke-RestMethod -Uri "http://127.0.0.1:17757/api/app/enterprise-agency/registrations/$registrationId/withdraw" -Method Post -Headers @{Authorization="Bearer $($fixture.owner)"}
  Nav "/pkg/pages/me/enterprise-agency/registration/index?revise=$registrationId"
  $state=Eval-Mini 'function(){var a=getCurrentPages().slice(-1)[0];return a.load().then(function(){return {error:a.data.loadError};});}'
  if($state.error){throw $state.error}
  $selected=Eval-Mini 'function(){var a=getCurrentPages().slice(-1)[0];a.setData({step:3});if(!a.data.form.consent)a.toggleConsent();return a.chooseFile({currentTarget:{dataset:{field:`legalRepresentative.idFront`,kind:`document`}}}).then(function(){return {file:a.data.form.legalRepresentative.idFront};});}'
  if(!$selected.file.local){throw 'Registration file was not local'}
  $response=Invoke-WebRequest -Uri "http://127.0.0.1:17757/api/app/enterprise-agency/registration/files/$($selected.file.fileId)" -Headers @{Authorization="Bearer $($fixture.owner)"} -SkipHttpErrorCheck
  if($response.StatusCode -ne 404){throw 'Unsubmitted registration file already persisted'}
  $null=Eval-Mini 'function(){getCurrentPages().slice(-1)[0].submit();return true;}'
  $created=$null
  for($attempt=0;$attempt -lt 20;$attempt++) {
   $current=Eval-Mini 'function(){var a=getCurrentPages().slice(-1)[0];return {id:a.data.submittedId,submitting:a.data.submitting,errors:a.data.errors};}'
   if($current.id){$created=$current.id;break}
   if(!$current.submitting){throw ($current|ConvertTo-Json -Depth 8)}
   Start-Sleep -Milliseconds 200
  }
  if($created -ne $registrationId){throw 'Registration revise failed'}
  $response=Invoke-WebRequest -Uri "http://127.0.0.1:17757/api/app/enterprise-agency/registration/files/$($selected.file.fileId)" -Headers @{Authorization="Bearer $($fixture.owner)"}
  if($response.StatusCode -ne 200){throw 'Submitted registration replacement unreadable'}
  Shot 'registration-revised'
  $results+=@{service='registration';id=$created;localBeforeSubmit=$true;fileAbsentBeforeSubmit=$true;fileReadableAfterSubmit=$true;status='pending'}
 }
 $reportFile=if($Services.Count -eq 1 -and $Services[0] -eq 'registration'){'registration-report.json'}else{'report.json'}
 $results|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 "$out/$reportFile"
 Write-Output "PASS native deferred multipart submissions $($results.Count)"
} finally {
 $restored=Eval-Mini 'function(){var a=getApp(),b=a.__preparationAudit;if(!b)return {restored:false};Object.keys(b.apis).forEach(function(k){wx[k]=b.apis[k]});Object.keys(b.storage).forEach(function(k){var x=b.storage[k];if(x.present)wx.setStorageSync(k,x.value);else wx.removeStorageSync(k)});a.globalData.siteConfig=b.config;if(b.tempPath){try{wx.getFileSystemManager().unlinkSync(b.tempPath)}catch(e){}}delete a.__preparationAudit;return {restored:true};}'
 Write-Output ($restored|ConvertTo-Json -Compress)
 if($installed.systemTheme){$null=(& wechatide -c Codex simulator_set_darkmode --project $project --mode $installed.systemTheme) -join "`n"}
 Remove-Item -LiteralPath $argsPath -ErrorAction SilentlyContinue
 Nav '/pages/home/index'
}
