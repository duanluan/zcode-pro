' ZCode Pro 静默启动器（Windows）
' 以隐藏窗口运行 zcode-pro.cmd：快捷方式启动时不会常驻黑色控制台窗口，
' 而 helper/注入进程继续在后台维持增强。
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = """" & dir & "\zcode-pro.cmd"""
If WScript.Arguments.Count > 0 Then
  Dim parts()
  ReDim parts(WScript.Arguments.Count - 1)
  For i = 0 To WScript.Arguments.Count - 1
    parts(i) = """" & WScript.Arguments(i) & """"
  Next
  cmd = cmd & " " & Join(parts, " ")
End If
sh.Run cmd, 0, False
