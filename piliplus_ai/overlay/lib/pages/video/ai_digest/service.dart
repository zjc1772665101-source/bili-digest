import 'dart:convert';
import 'dart:io';

import 'package:PiliPlus/http/browser_ua.dart';
import 'package:PiliPlus/http/loading_state.dart';
import 'package:PiliPlus/http/video.dart';
import 'package:PiliPlus/models_new/video/video_play_info/subtitle.dart';
import 'package:PiliPlus/pages/video/controller.dart';
import 'package:PiliPlus/utils/storage.dart';
import 'package:PiliPlus/utils/video_utils.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import 'model.dart';

class AiDigestService {
  AiDigestService._();
  static final instance = AiDigestService._();

  static const _settingsKey = 'pili_ai_digest_settings_v1';
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(minutes: 3),
      sendTimeout: const Duration(minutes: 3),
    ),
  );

  AiDigestSettings loadSettings() {
    final raw = GStorage.setting.get(_settingsKey);
    if (raw is! Map) return const AiDigestSettings();
    return AiDigestSettings(
      baseUrl: raw['baseUrl']?.toString() ?? '',
      apiKey: raw['apiKey']?.toString() ?? '',
      model: raw['model']?.toString() ?? '',
      reasoningEffort: raw['reasoningEffort']?.toString() ?? 'default',
      groqApiKey: raw['groqApiKey']?.toString() ?? '',
      groqModel: raw['groqModel']?.toString() ?? 'whisper-large-v3-turbo',
      asrLanguage: raw['asrLanguage']?.toString() ?? 'auto',
      translationLanguage:
          raw['translationLanguage']?.toString() ?? '简体中文',
    );
  }

  Future<void> saveSettings(AiDigestSettings value) => GStorage.setting.put(
        _settingsKey,
        <String, dynamic>{
          'baseUrl': value.baseUrl.trim(),
          'apiKey': value.apiKey.trim(),
          'model': value.model.trim(),
          'reasoningEffort': value.reasoningEffort,
          'groqApiKey': value.groqApiKey.trim(),
          'groqModel': value.groqModel,
          'asrLanguage': value.asrLanguage,
          'translationLanguage': value.translationLanguage,
        },
      );

  String _v1Root(String baseUrl) {
    var base = baseUrl.trim();
    while (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    if (base.endsWith('/chat/completions')) {
      base = base.substring(0, base.length - '/chat/completions'.length);
    }
    if (base.endsWith('/v1')) return base;
    return '$base/v1';
  }

  Options _aiOptions(AiDigestSettings settings) => Options(
        headers: {
          'Authorization': 'Bearer ${settings.apiKey.trim()}',
          'Content-Type': 'application/json',
        },
      );

  Future<List<String>> listModels(AiDigestSettings settings) async {
    if (settings.baseUrl.trim().isEmpty || settings.apiKey.trim().isEmpty) {
      throw StateError('请先填写 Base URL 和 API Key');
    }
    final res = await _dio.get(
      '${_v1Root(settings.baseUrl)}/models',
      options: _aiOptions(settings),
    );
    final list = res.data is Map ? res.data['data'] : null;
    if (list is! List) return const [];
    return list
        .map((e) => e is Map ? e['id']?.toString() : null)
        .whereType<String>()
        .where((e) => e.isNotEmpty)
        .toList()
      ..sort();
  }

  Future<String> chatCompletion(
    AiDigestSettings settings,
    List<Map<String, String>> messages, {
    double temperature = 0.2,
  }) async {
    if (!settings.aiConfigured) {
      throw StateError('请先在 AI 设置中填写接口地址、API Key 和模型');
    }
    final body = <String, dynamic>{
      'model': settings.model.trim(),
      'messages': messages,
      'temperature': temperature,
    };
    final effort = settings.reasoningEffort;
    if (effort != 'default' && effort != 'off') {
      body['reasoning_effort'] = effort;
    }
    final res = await _dio.post(
      '${_v1Root(settings.baseUrl)}/chat/completions',
      data: body,
      options: _aiOptions(settings),
    );
    final choices = res.data is Map ? res.data['choices'] : null;
    if (choices is! List || choices.isEmpty) {
      throw StateError('AI 接口没有返回 choices');
    }
    final message = choices.first is Map ? choices.first['message'] : null;
    final content = message is Map ? message['content'] : null;
    if (content is String && content.trim().isNotEmpty) return content.trim();
    if (content is List) {
      final text = content
          .map((e) => e is Map ? e['text']?.toString() ?? '' : e.toString())
          .join('\n')
          .trim();
      if (text.isNotEmpty) return text;
    }
    throw StateError('AI 接口返回内容为空');
  }

  String transcriptText(List<AiDigestSegment> segments, {int maxChars = 60000}) {
    final buffer = StringBuffer();
    for (final item in segments) {
      final line = '[${formatSeconds(item.from)}] ${item.content}\n';
      if (buffer.length + line.length > maxChars) break;
      buffer.write(line);
    }
    return buffer.toString();
  }

  Future<String> generateOverview(
    AiDigestSettings settings,
    String title,
    List<AiDigestSegment> segments,
  ) => chatCompletion(
        settings,
        [
          {
            'role': 'system',
            'content':
                '你是视频精读助手。基于字幕准确总结，不要虚构。使用简体中文。输出包括：一句话结论、核心要点、关键时间点、值得记住的细节。时间点必须引用字幕已有时间。',
          },
          {
            'role': 'user',
            'content': '视频标题：$title\n\n字幕：\n${transcriptText(segments)}',
          },
        ],
      );

  Future<String> askVideo(
    AiDigestSettings settings,
    String title,
    List<AiDigestSegment> segments,
    List<AiDigestChatMessage> history,
    String question,
  ) {
    final messages = <Map<String, String>>[
      {
        'role': 'system',
        'content':
            '你是视频问答助手，只根据提供的字幕和对话回答。无法从字幕确认时明确说明。引用具体内容时尽量给出 [mm:ss] 时间戳。',
      },
      {
        'role': 'system',
        'content': '视频标题：$title\n\n视频字幕：\n${transcriptText(segments)}',
      },
      ...history.takeLast(8).map((e) => {'role': e.role, 'content': e.content}),
      {'role': 'user', 'content': question},
    ];
    return chatCompletion(settings, messages);
  }

  Future<String> polishNote(AiDigestSettings settings, String note) =>
      chatCompletion(
        settings,
        [
          {
            'role': 'system',
            'content': '润色用户的视频笔记。保持原意，不添加不存在的信息，语言简洁清晰，只输出润色后的文本。',
          },
          {'role': 'user', 'content': note},
        ],
        temperature: 0.3,
      );

  Future<List<AiDigestSegment>> translateTranscript(
    AiDigestSettings settings,
    List<AiDigestSegment> segments,
  ) async {
    final output = <AiDigestSegment>[];
    var index = 0;
    while (index < segments.length) {
      final chunk = <AiDigestSegment>[];
      var chars = 0;
      while (index < segments.length && chunk.length < 80) {
        final next = segments[index];
        if (chunk.isNotEmpty && chars + next.content.length > 6000) break;
        chunk.add(next);
        chars += next.content.length;
        index++;
      }
      final numbered = <String>[];
      for (var i = 0; i < chunk.length; i++) {
        numbered.add('${i + 1}. ${chunk[i].content}');
      }
      final result = await chatCompletion(
        settings,
        [
          {
            'role': 'system',
            'content':
                '把每一条字幕翻译成${settings.translationLanguage}。保持条数和顺序完全一致。只输出 JSON 字符串数组，不要 markdown，不要解释。',
          },
          {'role': 'user', 'content': numbered.join('\n')},
        ],
        temperature: 0.1,
      );
      final translations = _parseStringArray(result);
      for (var i = 0; i < chunk.length; i++) {
        output.add(
          chunk[i].copyWith(
            translation: i < translations.length ? translations[i] : '',
          ),
        );
      }
    }
    return output;
  }

  List<String> _parseStringArray(String input) {
    var text = input.trim();
    if (text.startsWith('```')) {
      text = text.replaceFirst(RegExp(r'^```(?:json)?\s*'), '');
      text = text.replaceFirst(RegExp(r'\s*```$'), '');
    }
    final start = text.indexOf('[');
    final end = text.lastIndexOf(']');
    if (start >= 0 && end > start) text = text.substring(start, end + 1);
    try {
      final decoded = jsonDecode(text);
      if (decoded is List) return decoded.map((e) => e.toString()).toList();
    } catch (_) {}
    return const [];
  }

  Future<List<AiDigestSegment>> loadBiliSubtitles(
    VideoDetailController controller, {
    int trackIndex = 0,
  }) async {
    List<Subtitle> tracks = controller.subtitles.toList();
    if (tracks.isEmpty) {
      final info = (await VideoHttp.playInfo(
        bvid: controller.bvid,
        cid: controller.cid.value,
        seasonId: controller.seasonId,
        epId: controller.epId,
      )).dataOrNull;
      tracks = info?.subtitle?.subtitles?.toList() ?? const [];
      if (tracks.isNotEmpty) controller.subtitles.assignAll(tracks);
    }
    if (tracks.isEmpty) return const [];
    final safeIndex = trackIndex.clamp(0, tracks.length - 1);
    final url = tracks[safeIndex].subtitleUrl;
    if (url == null || url.isEmpty) return const [];
    final fullUrl = url.startsWith('//') ? 'https:$url' : url;
    final res = await _dio.get(fullUrl);
    final body = res.data is Map ? res.data['body'] : null;
    if (body is! List) return const [];
    return body
        .whereType<Map>()
        .map(
          (item) => AiDigestSegment(
            from: (item['from'] as num?)?.toDouble() ?? 0,
            to: (item['to'] as num?)?.toDouble() ?? 0,
            content: item['content']?.toString().trim() ?? '',
          ),
        )
        .where((item) => item.content.isNotEmpty)
        .toList();
  }

  Future<List<AiDigestSegment>> generateGroqTranscript(
    VideoDetailController controller,
    AiDigestSettings settings,
    void Function(double progress)? onProgress,
  ) async {
    if (!settings.asrConfigured) {
      throw StateError('请先在 AI 设置中填写 Groq API Key');
    }
    final audioList = controller.data.dash?.audio;
    if (audioList == null || audioList.isEmpty) {
      throw StateError('当前视频没有可用的 DASH 音轨');
    }
    final sorted = audioList.toList()
      ..sort((a, b) => (a.bandWidth ?? 1 << 30).compareTo(b.bandWidth ?? 1 << 30));
    final audioUrl = VideoUtils.getCdnUrl(sorted.first.playUrls, isAudio: true);
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/pili_ai_${controller.cid.value}.m4a');
    try {
      await _dio.download(
        audioUrl,
        file.path,
        options: Options(
          headers: {
            'User-Agent': BrowserUa.pc,
            'Referer': 'https://www.bilibili.com/video/${controller.bvid}',
          },
        ),
        onReceiveProgress: (received, total) {
          if (total > 0) onProgress?.call(received / total * 0.55);
        },
      );
      final bytes = await file.length();
      const maxBytes = 25 * 1024 * 1024;
      if (bytes > maxBytes) {
        throw StateError(
          '最低码率音轨仍有 ${(bytes / 1024 / 1024).toStringAsFixed(1)} MB，超过 Groq 免费接口单文件 25 MB 限制',
        );
      }
      onProgress?.call(0.6);
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(file.path, filename: 'audio.m4a'),
        'model': settings.groqModel,
        'response_format': 'verbose_json',
        'temperature': '0',
        if (settings.asrLanguage != 'auto') 'language': settings.asrLanguage,
      });
      final res = await _dio.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        data: form,
        options: Options(
          headers: {'Authorization': 'Bearer ${settings.groqApiKey.trim()}'},
          contentType: 'multipart/form-data',
        ),
        onSendProgress: (sent, total) {
          if (total > 0) onProgress?.call(0.6 + sent / total * 0.35);
        },
      );
      onProgress?.call(0.98);
      final data = res.data;
      final rawSegments = data is Map ? data['segments'] : null;
      if (rawSegments is List && rawSegments.isNotEmpty) {
        return rawSegments
            .whereType<Map>()
            .map(
              (item) => AiDigestSegment(
                from: (item['start'] as num?)?.toDouble() ?? 0,
                to: (item['end'] as num?)?.toDouble() ?? 0,
                content: item['text']?.toString().trim() ?? '',
              ),
            )
            .where((item) => item.content.isNotEmpty)
            .toList();
      }
      final text = data is Map ? data['text']?.toString().trim() : null;
      if (text != null && text.isNotEmpty) {
        return [
          AiDigestSegment(
            from: 0,
            to: (controller.data.timeLength ?? 0) / 1000,
            content: text,
          ),
        ];
      }
      throw StateError('Groq 没有返回转写文本');
    } finally {
      if (await file.exists()) {
        try {
          await file.delete();
        } catch (_) {}
      }
    }
  }

  String _notesKey(String bvid, int cid) => 'pili_ai_notes:$bvid:$cid';

  List<AiDigestNote> loadNotes(String bvid, int cid) {
    final raw = GStorage.setting.get(_notesKey(bvid, cid));
    if (raw is! String || raw.isEmpty) return const [];
    try {
      final list = jsonDecode(raw);
      if (list is! List) return const [];
      return list.whereType<Map>().map(AiDigestNote.fromJson).toList()
        ..sort((a, b) => a.timeMs.compareTo(b.timeMs));
    } catch (_) {
      return const [];
    }
  }

  Future<void> saveNotes(String bvid, int cid, List<AiDigestNote> notes) =>
      GStorage.setting.put(
        _notesKey(bvid, cid),
        jsonEncode(notes.map((e) => e.toJson()).toList()),
      );

  String formatSeconds(double value) {
    final seconds = value.round().clamp(0, 24 * 3600 * 100);
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    if (h > 0) {
      return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    }
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
}

extension<T> on Iterable<T> {
  Iterable<T> takeLast(int count) {
    if (count <= 0) return const Iterable.empty();
    final list = toList();
    return list.skip(list.length > count ? list.length - count : 0);
  }
}
