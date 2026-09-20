; setup.iss — EditPrompt Windows installer
; Build with Inno Setup (https://jrsoftware.org/isinfo.php):
;   1. Install Inno Setup on your PC.
;   2. Run build.ps1 first so EditPrompt.exe exists.
;   3. Right-click setup.iss -> "Compile" (or open in Inno Setup and press Build).
;   4. Output installer .exe appears in the "installer-output" folder.

#define MyAppName "EditPrompt"
#define MyAppVersion "6.0.0"
#define MyAppPublisher "EditPrompt"
#define MyAppURL "https://editprompt.in"
#define MyAppExeName "EditPrompt.exe"

[Setup]
AppId={{9C6E6E7C-6B1E-4B34-9A2E-EDITPROMPT001}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=installer-output
OutputBaseFilename=EditPrompt-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
SetupIconFile=build-assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "EditPrompt.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "downloads\*"; DestDir: "{app}\downloads"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: ".env.example"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist
; NOTE: existing editprompt.db is NOT bundled here on purpose — a fresh install
; should start with a clean database. If you want to ship seed data, add:
; Source: "editprompt.db"; DestDir: "{app}"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
