from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
source = Path(__file__).resolve().parent / 'overlay'

# 1) Copy new native Flutter feature files.
shutil.copytree(source, root, dirs_exist_ok=True)

# 2) Give the test APK an independent Android applicationId and label.
gradle = root / 'android/app/build.gradle.kts'
text = gradle.read_text(encoding='utf-8')
features_anchor = '''    buildFeatures {
        if (project.hasProperty("dev")) {
            resValues = true
        }
    }
'''
features_replacement = '''    buildFeatures {
        if (project.hasProperty("dev") || project.hasProperty("ai")) {
            resValues = true
        }
    }
'''
if features_anchor not in text:
    raise SystemExit('build.gradle.kts buildFeatures anchor not found')
text = text.replace(features_anchor, features_replacement, 1)
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
    raise SystemExit('build.gradle.kts release anchor not found')
text = text.replace(needle, replacement, 1)
gradle.write_text(text, encoding='utf-8')

# 3) Normalize a few Dart expressions whose generic numeric return types are
# intentionally stricter on the Flutter/Dart version pinned by PiliPlus.
service = root / 'lib/pages/video/ai_digest/service.dart'
text = service.read_text(encoding='utf-8')
text = text.replace(
    'final safeIndex = trackIndex.clamp(0, tracks.length - 1);',
    'final safeIndex = trackIndex.clamp(0, tracks.length - 1).toInt();',
)
text = text.replace(
    'final seconds = value.round().clamp(0, 24 * 3600 * 100);',
    'final seconds = value.round().clamp(0, 24 * 3600 * 100).toInt();',
)
text = text.replace('return const Iterable.empty();', 'return <T>[];')
service.write_text(text, encoding='utf-8')

view = root / 'lib/pages/video/ai_digest/view.dart'
text = view.read_text(encoding='utf-8')
text = text.replace(
    "import 'dart:async';",
    "import 'dart:async';\nimport 'dart:ui' show FontFeature;",
    1,
)
text = text.replace(
    'asrProgress = value.clamp(0, 1);',
    'asrProgress = value.clamp(0, 1).toDouble();',
)
text = text.replace(
    'value: trackIndex.clamp(0, tracks.length - 1),',
    'value: trackIndex.clamp(0, tracks.length - 1).toInt(),',
)
text = text.replace(
'''                  switch (value) {
                    case 'translate':
                      _translate();
                    case 'reload':
                      _loadTranscript();
                    case 'asr':
                      _generateAsr();
                  }''',
'''                  switch (value) {
                    case 'translate':
                      _translate();
                      break;
                    case 'reload':
                      _loadTranscript();
                      break;
                    case 'asr':
                      _generateAsr();
                      break;
                  }''',
)
view.write_text(text, encoding='utf-8')

# 4) Replace the existing B-site-only AI bottom sheet with the unified assistant.
video_view = root / 'lib/pages/video/view.dart'
text = video_view.read_text(encoding='utf-8')
import_anchor = "import 'package:PiliPlus/pages/video/ai_conclusion/view.dart';"
if import_anchor not in text:
    raise SystemExit('video/view.dart import anchor not found')
text = text.replace(
    import_anchor,
    import_anchor + "\nimport 'package:PiliPlus/pages/video/ai_digest/view.dart';",
    1,
)
old_sheet = '''  // ai总结
  void showAiBottomSheet() {
    videoDetailController.childKey.currentState?.showBottomSheet(
      constraints: const BoxConstraints(),
      (context) =>
          AiConclusionPanel(item: ugcIntroController.aiConclusionResult!),
    );
  }
'''
new_sheet = '''  // AI 视频助手：统一承载 B站速览、字幕、问答和时间戳笔记。
  void showAiBottomSheet() {
    videoDetailController.childKey.currentState?.showBottomSheet(
      constraints: const BoxConstraints(),
      (context) => AiDigestPanel(heroTag: heroTag),
    );
  }
'''
if old_sheet not in text:
    raise SystemExit('video/view.dart AI sheet anchor not found')
text = text.replace(old_sheet, new_sheet, 1)
video_view.write_text(text, encoding='utf-8')

# 5) Make the existing AI icon open the assistant even when B站 has no official summary.
ugc_view = root / 'lib/pages/video/introduction/ugc/view.dart'
text = ugc_view.read_text(encoding='utf-8')
old_tap = '''        onTap: () async {
          if (introController.aiConclusionResult == null) {
            await introController.aiConclusion();
          }
          if (introController.aiConclusionResult case AiConclusionResult(
            :final summary,
            :final outline,
          )) {
            if (summary?.isNotEmpty == true || outline?.isNotEmpty == true) {
              widget.showAiBottomSheet();
            } else {
              SmartDialog.showToast("当前视频不支持AI视频总结");
            }
          }
        },
'''
new_tap = '''        onTap: () => widget.showAiBottomSheet(),
'''
if old_tap not in text:
    raise SystemExit('ugc/view.dart AI tap anchor not found')
text = text.replace(old_tap, new_tap, 1)
text = text.replace("semanticLabel: 'AI总结'", "semanticLabel: 'AI视频助手'", 1)
ugc_view.write_text(text, encoding='utf-8')

# 6) Keep the feed card action lightweight and distinguish it from the full assistant.
popup = root / 'lib/common/widgets/video_popup_menu.dart'
text = popup.read_text(encoding='utf-8')
text = text.replace("'AI总结',", "'AI速览',", 1)
popup.write_text(text, encoding='utf-8')

print('Applied PiliPlus AI integration and Android package isolation')
