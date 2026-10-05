"""Build the native personal Mac app and pin it to the Dock."""
import json, os, pathlib, plistlib, shutil, subprocess, tempfile

root = pathlib.Path(__file__).resolve().parent.parent
app = pathlib.Path('/Applications/D.one Magazine.app')
contents = app / 'Contents'
resources = contents / 'Resources'
binary = contents / 'MacOS'
resources.mkdir(parents=True, exist_ok=True)
binary.mkdir(parents=True, exist_ok=True)
node = shutil.which('node')
codex = shutil.which('codex')
if not node or not codex:
    raise RuntimeError('Node.js와 Codex CLI가 필요합니다.')
settings = {'projectRoot':str(root), 'nodePath':node, 'codexPath':codex,
            'path':os.environ['PATH']}
(resources/'settings.json').write_text(json.dumps(settings))
info = {'CFBundleName':'D.one Magazine', 'CFBundleDisplayName':'D.one Magazine',
        'CFBundleIdentifier':'com.jdh4601.done-magazine', 'CFBundleExecutable':'DoneMagazine',
        'CFBundlePackageType':'APPL', 'CFBundleVersion':'1', 'CFBundleShortVersionString':'1.0',
        'CFBundleIconFile':'AppIcon', 'LSMinimumSystemVersion':'12.0',
        'NSHighResolutionCapable':True,
        'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True}}
with (contents/'Info.plist').open('wb') as f:
    plistlib.dump(info, f)
subprocess.run(['xcrun','clang','-fobjc-arc','-O2','-framework','Cocoa','-framework','WebKit',
                str(root/'desktop/App.m'),'-o',str(binary/'DoneMagazine')],check=True)
with tempfile.TemporaryDirectory() as work:
    iconset = pathlib.Path(work)/'AppIcon.iconset'; iconset.mkdir()
    script = r'''import sharp from 'sharp';
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" rx="220" fill="#0a0a0a"/><text x="512" y="605" text-anchor="middle" fill="white" font-family="Times,serif" font-size="280" font-weight="bold">D.one</text></svg>');
for(const size of [16,32,128,256,512])for(const scale of [1,2])await sharp(svg).resize(size*scale,size*scale).png().toFile(process.argv[2]+`/icon_${size}x${size}${scale===2?'@2x':''}.png`);
'''
    subprocess.run([node,'--input-type=module','-',str(iconset)],input=script,text=True,cwd=root,check=True)
    subprocess.run(['iconutil','-c','icns',str(iconset),'-o',str(resources/'AppIcon.icns')],check=True)
subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True)
subprocess.run(['/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister','-f',str(app)],check=True)
dock = plistlib.loads(subprocess.check_output(['defaults','export','com.apple.dock','-']))
identifier = info['CFBundleIdentifier']
if not any(t.get('tile-data',{}).get('bundle-identifier') == identifier for t in dock.get('persistent-apps',[])):
    tile = {'tile-data':{'file-data':{'_CFURLString':app.as_uri()+'/', '_CFURLStringType':15},
                        'file-label':'D.one Magazine', 'bundle-identifier':identifier}, 'tile-type':'file-tile'}
    subprocess.run(['defaults','write','com.apple.dock','persistent-apps','-array-add',plistlib.dumps(tile).decode()],check=True)
    subprocess.run(['killall','Dock'],check=True)
subprocess.run(['open',str(app)],check=True)
print(f'Installed and pinned: {app}')
