param(
  [string]$Workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
  [Alias('Sample')][ValidatePattern('^[a-z-]+/(free|fixed|manual)$')][string]$SampleFilter = ''
)
$ErrorActionPreference = 'Stop'
$project = "$Workspace/apps/wxminiprogram".Replace('\', '/')
$apiRoot = "$Workspace/apps/api"
$fixture = Get-Content -Raw "$apiRoot/.tmp/fee-visual-private.json" | ConvertFrom-Json
$out = "$apiRoot/.tmp/agency-fees-mini-20261031"
New-Item -ItemType Directory -Force $out | Out-Null
$payloadPath = "$apiRoot/.tmp/fee-mini-args.json"
function Eval-Mini([string]$code, [object[]]$payload = @()) {
  $source = $code.Trim().Replace("'", [string][char]96)
  [IO.File]::WriteAllText($payloadPath, (ConvertTo-Json -Depth 20 -InputObject $payload), (New-Object System.Text.UTF8Encoding($false)))
  $raw = (& wechatide -c Codex automation_evaluate --project $project --fn-source $source --args-file $payloadPath) -join "`n"
  $result = $raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
  if (!$result.ok -or !$result.result.success) { throw $raw }
  return $result.result.result.result
}
function Tool([string]$name, [string[]]$toolParams) {
  $raw = (& wechatide -c Codex $name --project $project @toolParams) -join "`n"
  $result = $raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
  if (!$result.ok -or $result.result.success -eq $false) { throw $raw }
  return $result.result
}
$configPath = "$project/config/index.js"
$originalConfig = [IO.File]::ReadAllText($configPath)
$results = @()
$samples = @($fixture.samples | Where-Object { !$SampleFilter -or "$($_.service)/$($_.mode)" -eq $SampleFilter })
if (!$samples.Count) { throw 'No matching fixture sample' }
$suffix = if ($SampleFilter) { '-supplement' } else { '' }
$installed = $false
try {
  [IO.File]::WriteAllText($configPath, $originalConfig.Replace('http://127.0.0.1:7757/api/app', 'http://127.0.0.1:17757/api/app'), (New-Object System.Text.UTF8Encoding($false)))
  $null = Tool 'simulator_refresh' @()
  $backup = Eval-Mini 'function(o){var a=getApp();if(a.__feeAudit)throw Error(`fee audit already active`);var b={apis:{},storage:{},globalData:Object.assign({},a.globalData),theme:wx.getSystemInfoSync().theme||`light`};[`joinyuu_client_token`,`joinyuu_client_profile`,`joinyuu_client_identity`,`joinyuu_mini_theme_mode`,`joinyuu_mini_theme_cache`].forEach(function(k){b.storage[k]={present:wx.getStorageInfoSync().keys.indexOf(k)>=0,value:wx.getStorageSync(k)}});a.__feeAudit=b;wx.setStorageSync(`joinyuu_client_token`,o.token);return {installed:true,theme:b.theme,storage:b.storage}}' @(@{ token = $fixture.owner })
  $installed = $true
  foreach ($sample in $samples) {
    Write-Output "Checking $($sample.service)/$($sample.mode)"
    $url = if ($sample.service -eq 'registration') { "/pkg/pages/me/enterprise-agency/detail/index?id=$($sample.id)" } else { "/pkg/pages/me/enterprise-services/$($sample.service)/detail/index?id=$($sample.id)" }
    $null = Tool 'simulator_open_page' @('--page',$url.Split('?')[0].TrimStart('/'),'--query',"id=$($sample.id)")
    $null = Tool 'automation_page_action' @('--action','getData','--wait','2')
    $state = Eval-Mini 'function(){var p=getCurrentPages().slice(-1)[0],c=p.selectComponent(`#agency-fee`);if(!c)throw Error(`fee component missing`);return c.load().then(function(){return {fee:c.data.fee,error:c.data.error,pageError:p.data.error,path:p.route}})}'
    if ($state.error -or $state.pageError -or !$state.fee) { throw "Fee failed: $($sample.service)/$($sample.mode): $($state.error) $($state.pageError)" }
    if ($state.path -ne $url.Split('?')[0].TrimStart('/')) { throw 'Opened page does not match requested detail' }
    if ($sample.mode -eq 'free' -and ($state.fee.decisionStatus -ne 'free' -or $state.fee.amountFen -ne 0)) { throw 'Free decision is inconsistent' }
    if ($sample.mode -eq 'fixed' -and ($state.fee.decisionStatus -ne 'quoted' -or $state.fee.amountFen -le 0)) { throw 'Fixed quote is inconsistent' }
    if ($state.fee.decisionStatus -eq 'pending_acceptance' -and $null -ne $state.fee.amountFen) { throw 'Unaccepted request must not have a confirmed amount' }
    $size = Eval-Mini 'function(){return new Promise(function(resolve){wx.createSelectorQuery().select(`.page`).boundingClientRect().exec(function(rows){resolve({height:rows[0]?rows[0].height:1800})})})}'
    for ($top = 0; $top -lt $size.height; $top += 620) {
      $null = Tool 'automation_viewport_action' @('--action','pageScrollTo','--scroll-top',[string]$top)
      $name = "$($sample.service)-$($sample.mode)$suffix-$top.jpg"
      $null = Tool 'simulator_screenshot' @('--path',"$out/$name",'--wait','1')
    }
    $results += @{service=$sample.service;mode=$sample.mode;id=$sample.id;status=$state.fee.decisionStatus;paymentStatus=$state.fee.paymentStatus;amount=$state.fee.amountFen;paidFen=$state.fee.paidFen;refundedFen=$state.fee.refundedFen;scrollHeight=$size.height}
    Write-Output "Passed $($sample.service)/$($sample.mode)"
  }
  $null = Tool 'simulator_set_darkmode' @('--mode','dark')
  $null = Tool 'automation_viewport_action' @('--action','pageScrollTo','--scroll-top','0')
  $null = Tool 'simulator_screenshot' @('--path',"$out/dark-fee$suffix.jpg",'--wait','1')
  $reportName = if ($SampleFilter) { 'supplement-report.json' } else { 'mini-report.json' }
  @{ checks=$results;channel='not invoked';screenshots=$out;capturedAt=(Get-Date -Format o) } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$out/$reportName" -Encoding utf8
  Write-Output "Mini fee acceptance: $($results.Count) detail pages; screenshots: $out"
} catch {
  $failure = $_
  try { $null = Tool 'simulator_screenshot' @('--path',"$out/failure.jpg"); Write-Output (Eval-Mini 'function(){var p=getCurrentPages().slice(-1)[0];return {route:p.route,error:p.data.error,hasDetail:!!p.data.detail}}' | ConvertTo-Json) } catch { Write-Output 'Failure diagnostics unavailable' }
  throw $failure
} finally {
  [IO.File]::WriteAllText($configPath, $originalConfig, (New-Object System.Text.UTF8Encoding($false)))
  try { if ($installed) {
    $null = Tool 'simulator_set_darkmode' @('--mode',$backup.theme)
    $null = Eval-Mini 'function(b){Object.keys(b.storage).forEach(function(k){var v=b.storage[k];if(v.present)wx.setStorageSync(k,v.value);else wx.removeStorageSync(k)});delete getApp().__feeAudit;return true}' @($backup)
    $null = Eval-Mini 'function(){return new Promise(function(resolve){wx.switchTab({url:`/pages/home/index`,complete:function(){resolve(true)}})})}'
  } } finally {
    $null = Tool 'simulator_refresh' @()
    Remove-Item -LiteralPath $payloadPath -ErrorAction SilentlyContinue
  }
}
