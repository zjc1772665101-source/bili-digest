from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()

gradle = root / 'android/app/build.gradle.kts'
text = gradle.read_text(encoding='utf-8')
needle = '        release {\n            if (project.hasProperty("dev")) {'
replacement = '''        release {
            if (project.hasProperty("ai")) {
                applicationIdSuffix = ".ai"
                resValue(
                    type = "string",
                    name = "app_name",
                    value = "PiliPlus AI",
                )
            }
            if (project.hasProperty("dev")) {'''
if needle not in text:
    raise SystemExit('build.gradle.kts patch anchor not found')
text = text.replace(needle, replacement, 1)
gradle.write_text(text, encoding='utf-8')

print('Applied isolated Android applicationId suffix: .ai')
