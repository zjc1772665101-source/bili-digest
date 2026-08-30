class AiDigestSegment {
  const AiDigestSegment({
    required this.from,
    required this.to,
    required this.content,
    this.translation,
  });

  final double from;
  final double to;
  final String content;
  final String? translation;

  AiDigestSegment copyWith({String? translation}) => AiDigestSegment(
        from: from,
        to: to,
        content: content,
        translation: translation ?? this.translation,
      );
}

class AiDigestChatMessage {
  const AiDigestChatMessage({required this.role, required this.content});
  final String role;
  final String content;
}

class AiDigestNote {
  const AiDigestNote({
    required this.timeMs,
    required this.text,
    required this.createdAt,
  });

  final int timeMs;
  final String text;
  final int createdAt;

  Map<String, dynamic> toJson() => {
        'timeMs': timeMs,
        'text': text,
        'createdAt': createdAt,
      };

  factory AiDigestNote.fromJson(Map data) => AiDigestNote(
        timeMs: (data['timeMs'] as num?)?.toInt() ?? 0,
        text: data['text']?.toString() ?? '',
        createdAt: (data['createdAt'] as num?)?.toInt() ?? 0,
      );
}

class AiDigestSettings {
  const AiDigestSettings({
    this.baseUrl = '',
    this.apiKey = '',
    this.model = '',
    this.reasoningEffort = 'default',
    this.groqApiKey = '',
    this.groqModel = 'whisper-large-v3-turbo',
    this.asrLanguage = 'auto',
    this.translationLanguage = '简体中文',
  });

  final String baseUrl;
  final String apiKey;
  final String model;
  final String reasoningEffort;
  final String groqApiKey;
  final String groqModel;
  final String asrLanguage;
  final String translationLanguage;

  bool get aiConfigured =>
      baseUrl.trim().isNotEmpty && apiKey.trim().isNotEmpty && model.trim().isNotEmpty;
  bool get asrConfigured => groqApiKey.trim().isNotEmpty;

  AiDigestSettings copyWith({
    String? baseUrl,
    String? apiKey,
    String? model,
    String? reasoningEffort,
    String? groqApiKey,
    String? groqModel,
    String? asrLanguage,
    String? translationLanguage,
  }) => AiDigestSettings(
        baseUrl: baseUrl ?? this.baseUrl,
        apiKey: apiKey ?? this.apiKey,
        model: model ?? this.model,
        reasoningEffort: reasoningEffort ?? this.reasoningEffort,
        groqApiKey: groqApiKey ?? this.groqApiKey,
        groqModel: groqModel ?? this.groqModel,
        asrLanguage: asrLanguage ?? this.asrLanguage,
        translationLanguage: translationLanguage ?? this.translationLanguage,
      );
}
