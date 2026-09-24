$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework

$window = New-Object System.Windows.Window
$window.Title = 'NYX Disposable UI Fixture'
$window.Width = 420
$window.Height = 220
$window.WindowStartupLocation = 'CenterScreen'

$layout = New-Object System.Windows.Controls.StackPanel
$layout.Margin = '18'

$inputControl = New-Object System.Windows.Controls.TextBox
$inputControl.Name = 'NyxInput'
$inputControl.Height = 32
$inputControl.Text = 'initial'
[System.Windows.Automation.AutomationProperties]::SetAutomationId($inputControl, 'NyxInput')
$layout.Children.Add($inputControl) | Out-Null

$runButton = New-Object System.Windows.Controls.Button
$runButton.Name = 'NyxRun'
$runButton.Content = 'Run fixture action'
$runButton.Height = 36
$runButton.Margin = '0,12,0,0'
[System.Windows.Automation.AutomationProperties]::SetAutomationId($runButton, 'NyxRun')
$layout.Children.Add($runButton) | Out-Null

$status = New-Object System.Windows.Controls.TextBlock
$status.Name = 'NyxStatus'
$status.Text = 'Count: 0'
$status.Margin = '0,12,0,0'
[System.Windows.Automation.AutomationProperties]::SetAutomationId($status, 'NyxStatus')
$layout.Children.Add($status) | Out-Null

$runButton.Add_Click({ $status.Text = 'Count: 1' })
$window.Content = $layout
Write-Host "NYX_DESKTOP_FIXTURE_PID=$PID"
$window.ShowDialog() | Out-Null
