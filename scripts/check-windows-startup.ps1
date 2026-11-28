param(
    [Parameter(Mandatory)]
    [string]$ExecutablePath
)

$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $ExecutablePath).Path

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class MaoTaoStartupCheck
{
    private delegate bool WindowCallback(IntPtr window, IntPtr data);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(WindowCallback callback, IntPtr data);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int capacity);

    public static bool HasVisibleWindow(uint processId, string title)
    {
        bool found = false;
        EnumWindows((window, data) =>
        {
            GetWindowThreadProcessId(window, out uint owner);
            if (owner != processId || !IsWindowVisible(window)) return true;
            var text = new StringBuilder(256);
            GetWindowText(window, text, text.Capacity);
            found = text.ToString() == title;
            return !found;
        }, IntPtr.Zero);
        return found;
    }
}
'@

$title = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../src-tauri/tauri.conf.json') -Raw |
    ConvertFrom-Json).app.windows | Where-Object label -eq 'pet' | Select-Object -ExpandProperty title
$process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        if ($process.HasExited) {
            throw "MAOTAO.exe exited with code $($process.ExitCode) before the pet window appeared."
        }
        if ([MaoTaoStartupCheck]::HasVisibleWindow($process.Id, $title)) {
            if ($process.WaitForExit(3000)) {
                throw "MAOTAO.exe exited with code $($process.ExitCode) after showing the pet window."
            }
            Write-Host 'MAOTAO.exe is running and its pet window is visible.'
            return
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'MAOTAO.exe started but the pet window did not appear within 30 seconds.'
} finally {
    if (!$process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue }
}
