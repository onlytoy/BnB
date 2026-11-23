"""Create the portable fnOS runtime ZIP from explicit application files."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / "dist"
output.mkdir(exist_ok=True)
ws = root / "node_modules" / "ws"
if not (ws / "package.json").is_file():
    raise SystemExit("Run npm ci --omit=dev --ignore-scripts before packaging.")
if list(ws.rglob("*.node")):
    raise SystemExit("Native runtime dependencies require a separate Linux build.")
package = json.loads((root / "package.json").read_text())
if set(package["dependencies"]) != {"ws"}:
    raise SystemExit("Review the runtime dependency list before packaging.")
try:
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()
except (subprocess.CalledProcessError, FileNotFoundError):
    commit = "source-archive"

archive = output / "bnb-fnos.zip"
with tempfile.TemporaryDirectory(prefix=".bnb-pack-", dir=output) as temporary:
    folder = Path(temporary) / "bnb-fnos"
    app = folder / "app"
    app.mkdir(parents=True)
    for name in ("client", "server"):
        shutil.copytree(root / name, app / name, ignore=shutil.ignore_patterns(".DS_Store", "Thumbs.db"))
    shutil.copytree(ws, app / "node_modules" / "ws")
    for name in ("package.json", "package-lock.json"):
        shutil.copy2(root / name, app / name)
    shutil.copy2(root / "deploy" / "compose.nas.yaml", folder / "docker-compose.yml")
    shutil.copy2(root / "docs" / "fnOS部署教程.md", folder / "fnOS部署教程.md")
    (folder / "README.md").write_text(
        "# 泡泡堂 BnB · fnOS 手机触控版\n\n"
        "来源：[tpoisonooo/BnB](https://github.com/tpoisonooo/BnB)。\n"
        "手机版：[onlytoy/BnB](https://github.com/onlytoy/BnB)，mobile-fnos 分支。\n\n"
        "1. 上传整个 bnb-fnos 文件夹到飞牛的 docker 目录。\n"
        "2. 用该目录的 docker-compose.yml 创建 Compose 项目。\n"
        "3. 打开 http://NAS的局域网IP:3001/，手机推荐横屏。\n\n"
        "完整步骤见 [fnOS 部署教程](fnOS部署教程.md)。首次启动需要下载 node:24-alpine。\n"
    )
    (folder / "来源说明.md").write_text(
        "# 来源与版权\n\n"
        "原始仓库：[tpoisonooo/BnB](https://github.com/tpoisonooo/BnB)。\n"
        "上游基线：5c108e8ad3ea07684d4666f60e6eec6c2f3e569e。\n\n"
        "本部署包由 [onlytoy/BnB](https://github.com/onlytoy/BnB) 的 mobile-fnos 分支制作，"
        "增加手机触屏和 Docker / 飞牛部署支持，原游戏贡献归原作者。\n\n"
        "《泡泡堂》原作素材版权归盛趣游戏（原盛大网络）/ Nexon。"
        "沿用上游学习和研究用途说明，不改变原代码或素材的权利归属。"
        "[完整上游说明与致谢](https://github.com/tpoisonooo/BnB#readme)。\n"
    )
    metadata = {
        "repository": "https://github.com/onlytoy/BnB", "branch": "mobile-fnos", "commit": commit,
        "upstream": "https://github.com/tpoisonooo/BnB", "version": package["version"],
        "runtime": "node:24-alpine", "dependency": "ws@" + json.loads((ws / "package.json").read_text())["version"],
    }
    (folder / "版本信息.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for file in sorted(folder.rglob("*")):
            if file.is_file():
                file.chmod(0o644)
                bundle.write(file, file.relative_to(folder.parent))
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None

checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / "bnb-fnos.zip.sha256").write_text(f"{checksum}  bnb-fnos.zip\n")
print(f"{archive}\n{archive.stat().st_size / 1024 / 1024:.1f} MiB\nSHA256 {checksum}")
