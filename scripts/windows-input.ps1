param([string]$Action, [int]$X, [int]$Y, [int]$TargetX, [int]$TargetY, [string]$Title, [int]$ProcessId)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TestInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct Point { public int X, Y; }
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetCursorPos(out Point value);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point value);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder output, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, System.Text.StringBuilder output, int size);
  public static string Name(IntPtr hwnd) {
    var windowText = new System.Text.StringBuilder(192);
    var kind = new System.Text.StringBuilder(192);
    GetWindowText(hwnd, windowText, 192);
    GetClassName(hwnd, kind, 192);
    return kind.ToString() + "|" + windowText.ToString();
  }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, ref Input value, int size);
  [StructLayout(LayoutKind.Sequential)]
  struct MouseData { public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)]
  struct KeyData { public ushort Key, Scan; public uint Flags, Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Explicit, Size=40)]
  struct Input {
    [FieldOffset(0)] public uint Type;
    [FieldOffset(8)] public MouseData Mouse;
    [FieldOffset(8)] public KeyData Key;
  }
  public static int Mouse(uint flags) {
    var input = new Input { Mouse = new MouseData { Flags = flags } };
    return SendInput(1, ref input, 40) == 1 ? 0 : Marshal.GetLastWin32Error();
  }
  public static int Key(ushort key, uint flags) {
    var input = new Input { Type = 1, Key = new KeyData { Key = key, Flags = flags } };
    return SendInput(1, ref input, 40) == 1 ? 0 : Marshal.GetLastWin32Error();
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string windowClass, string title);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
"@
try { [void][TestInput]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
try { [void][TestInput]::SetThreadDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
if ($Action -eq 'find') {
  $window = [TestInput]::FindWindow('Chrome_WidgetWin_1', $Title)
  if ($window -eq [IntPtr]::Zero -or ![TestInput]::IsWindowVisible($window)) { 'null'; exit }
  $r = New-Object TestInput+Rect
  [void][TestInput]::GetWindowRect($window, [ref]$r)
  [pscustomobject]@{ x=$r.Left; y=$r.Top; width=$r.Right-$r.Left; height=$r.Bottom-$r.Top } | ConvertTo-Json -Compress
  exit
}
if ($Action -eq 'foreground') {
  [TestInput]::Name([TestInput]::GetForegroundWindow()) | ConvertTo-Json -Compress
  exit
}
if ($Action -eq 'find-title') {
  $window = [TestInput]::FindWindow($null, $Title)
  if ($window -eq [IntPtr]::Zero) { 'null'; exit }
  $r = New-Object TestInput+Rect
  [void][TestInput]::GetWindowRect($window, [ref]$r)
  [pscustomobject]@{ x=$r.Left; y=$r.Top; width=$r.Right-$r.Left; height=$r.Bottom-$r.Top;
    hwnd=$window.ToInt64(); visible=[TestInput]::IsWindowVisible($window); title=[TestInput]::Name($window) } | ConvertTo-Json -Compress
  exit
}
if ($Action -eq 'find-process') {
  $process = Get-Process -Id $ProcessId -ErrorAction Stop
  $window = [IntPtr]$process.MainWindowHandle
  if ($window -eq [IntPtr]::Zero) { 'null'; exit }
  $r = New-Object TestInput+Rect
  [void][TestInput]::GetWindowRect($window, [ref]$r)
  [pscustomobject]@{ x=$r.Left; y=$r.Top; width=$r.Right-$r.Left; height=$r.Bottom-$r.Top;
    hwnd=$window.ToInt64(); visible=[TestInput]::IsWindowVisible($window); title=[TestInput]::Name($window) } | ConvertTo-Json -Compress
  exit
}
if ($Action -eq 'show-title') {
  $window = [TestInput]::FindWindow('Chrome_WidgetWin_1', $Title)
  if ($window -eq [IntPtr]::Zero) { 'null'; exit }
  [void][TestInput]::ShowWindow($window, 5)
  [void][TestInput]::SetForegroundWindow($window)
  [pscustomobject]@{ hwnd=$window.ToInt64(); visible=[TestInput]::IsWindowVisible($window);
    title=[TestInput]::Name($window); foreground=[TestInput]::Name([TestInput]::GetForegroundWindow()) } | ConvertTo-Json -Compress
  exit
}
if ($Action -eq 'exit-menu') {
  foreach ($code in 0x23, 0x0D) {
    [void][TestInput]::Key([ushort]$code, 0)
    [void][TestInput]::Key([ushort]$code, 2)
    Start-Sleep -Milliseconds 160
  }
  exit
}
if ($Action -eq 'key') {
  [void][TestInput]::Key([ushort]$X, 0)
  [void][TestInput]::Key([ushort]$X, 2)
  exit
}
$set = [TestInput]::SetCursorPos($X, $Y)
$position = New-Object TestInput+Point
$read = [TestInput]::GetCursorPos([ref]$position)
$hit = [TestInput]::WindowFromPoint($position)
$focus = [TestInput]::GetForegroundWindow()

Start-Sleep -Milliseconds 85
if ($Action -eq 'probe') {
  $bounds = New-Object TestInput+Rect
  [void][TestInput]::GetWindowRect([TestInput]::GetAncestor($hit, 2), [ref]$bounds)
  [Console]::Error.WriteLine(("{0},{1} {2}x{3}" -f $bounds.Left,$bounds.Top,($bounds.Right-$bounds.Left),($bounds.Bottom-$bounds.Top)))
  [pscustomobject]@{ set=$set; read=$read; x=$position.X; y=$position.Y; hit=$hit.ToInt64(); root=[TestInput]::GetAncestor($hit, 2).ToInt64(); class=[TestInput]::Name([TestInput]::GetAncestor($hit, 2)) } | ConvertTo-Json -Compress
  exit
}
$down = if ($Action -eq 'right') { 8 } else { 2 }
$up = if ($Action -eq 'right') { 16 } else { 4 }
[void][TestInput]::SetCursorPos($X, $Y)
$downResult = [TestInput]::Mouse($down)
if ($Action -eq 'drag') {
  Start-Sleep -Milliseconds 120
  for ($i = 1; $i -le 24; $i++) {
    [void][TestInput]::SetCursorPos([int]($X + ($TargetX - $X) * $i / 24), [int]($Y + ($TargetY - $Y) * $i / 24))
    Start-Sleep -Milliseconds 35
  }
} elseif ($Action -eq 'hold-drag') {
  Start-Sleep -Milliseconds 450
  for ($i = 1; $i -le 24; $i++) {
    [void][TestInput]::SetCursorPos([int]($X + ($TargetX - $X) * $i / 24), [int]($Y + ($TargetY - $Y) * $i / 24))
    Start-Sleep -Milliseconds 35
  }
}
Start-Sleep -Milliseconds 65
$upResult = [TestInput]::Mouse($up)
$finalPosition = New-Object TestInput+Point
$finalRead = [TestInput]::GetCursorPos([ref]$finalPosition)




[pscustomobject]@{ set=$set; read=$read; x=$position.X; y=$position.Y; finalX=$finalPosition.X; finalY=$finalPosition.Y; finalRead=$finalRead; hit=$hit.ToInt64(); root=[TestInput]::GetAncestor($hit, 2).ToInt64(); foreground=$focus.ToInt64(); class=[TestInput]::Name([TestInput]::GetAncestor($hit, 2)); down=$downResult; up=$upResult } | ConvertTo-Json -Compress




