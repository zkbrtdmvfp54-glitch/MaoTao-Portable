param([string]$StatePath, [int]$Left, [int]$Top)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class FixtureNative {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
"@
$form = [Windows.Forms.Form]::new()
$form.Text = 'MAOTAO external input fixture'
$form.StartPosition = [Windows.Forms.FormStartPosition]::Manual
$form.Location = [Drawing.Point]::new($Left, $Top)
$form.Size = [Drawing.Size]::new(360, 190)
$form.KeyPreview = $true
$form.TopMost = $true
$form.BackColor = [Drawing.Color]::LightSteelBlue
$script:keyCount = 0
$script:clickCount = 0
function SaveState {
  $value = [pscustomobject]@{ keys=$script:keyCount; clicks=$script:clickCount; pid=$PID;
    visible=$form.Visible; handle=$form.Handle.ToInt64(); title=$form.Text }
  [IO.File]::WriteAllText($StatePath, ($value | ConvertTo-Json -Compress))
}
$form.add_Shown({
  [void][FixtureNative]::ShowWindow($form.Handle, 5)
  $form.Activate()
  [void][FixtureNative]::SetForegroundWindow($form.Handle)
  SaveState
})
$form.add_KeyDown({ $script:keyCount++; SaveState })
$form.add_MouseDown({ $script:clickCount++; SaveState })
[Windows.Forms.Application]::Run($form)
