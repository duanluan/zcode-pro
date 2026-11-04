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
    ' 剔除参数里的双引号（Windows 文件名不含引号）：带着引号拼进 cmd /c 会提前
    ' 闭合引号，后面的字符被当命令执行（如拖放文件名带引号的场景）
    parts(i) = """" & Replace(WScript.Arguments(i), """", "") & """"
  Next
  cmd = cmd & " " & Join(parts, " ")
End If
' 经 cmd.exe 调用批处理，避免 wscript 直接运行 .cmd 在部分机器上启动异常（issue #1）
sh.Run "cmd.exe /d /c " & cmd, 0, False
