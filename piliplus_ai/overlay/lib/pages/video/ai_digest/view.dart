import 'dart:async';

import 'package:PiliPlus/models_new/video/video_ai_conclusion/model_result.dart';
import 'package:PiliPlus/pages/video/controller.dart';
import 'package:PiliPlus/pages/video/introduction/ugc/controller.dart';
import 'package:flutter_smart_dialog/flutter_smart_dialog.dart';
import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import 'model.dart';
import 'service.dart';

class AiDigestPanel extends StatefulWidget {
  const AiDigestPanel({super.key, required this.heroTag});

  final String heroTag;

  @override
  State<AiDigestPanel> createState() => _AiDigestPanelState();
}

class _AiDigestPanelState extends State<AiDigestPanel>
    with SingleTickerProviderStateMixin {
  final service = AiDigestService.instance;
  late final VideoDetailController videoController;
  late final UgcIntroController introController;
  late final TabController tabController;

  final chatInput = TextEditingController();
  final noteInput = TextEditingController();
  final chatScroll = ScrollController();

  AiDigestSettings settings = const AiDigestSettings();
  List<AiDigestSegment> segments = const [];
  List<AiDigestChatMessage> chat = const [];
  List<AiDigestNote> notes = const [];
  String? deepOverview;
  String transcriptStatus = '正在读取字幕…';
  bool loadingTranscript = false;
  bool loadingOverview = false;
  bool loadingOfficial = false;
  bool translating = false;
  bool asking = false;
  bool polishing = false;
  bool generatingAsr = false;
  double asrProgress = 0;
  bool bilingual = false;
  int trackIndex = 0;
  int currentMs = 0;

  String get title {
    try {
      return introController.videoDetail.value.title ?? videoController.bvid;
    } catch (_) {
      return videoController.bvid;
    }
  }

  @override
  void initState() {
    super.initState();
    videoController = Get.find<VideoDetailController>(tag: widget.heroTag);
    introController = Get.find<UgcIntroController>(tag: widget.heroTag);
    tabController = TabController(length: 4, vsync: this);
    settings = service.loadSettings();
    notes = service.loadNotes(videoController.bvid, videoController.cid.value);
    currentMs = videoController.plPlayerController.positionInMilliseconds;
    videoController.plPlayerController.addPositionListener(_onPosition);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadTranscript();
      _loadOfficialSummary();
    });
  }

  void _onPosition(Duration position) {
    if (!mounted) return;
    final next = position.inMilliseconds;
    if ((next - currentMs).abs() >= 400) {
      setState(() => currentMs = next);
    }
  }

  @override
  void dispose() {
    videoController.plPlayerController.removePositionListener(_onPosition);
    tabController.dispose();
    chatInput.dispose();
    noteInput.dispose();
    chatScroll.dispose();
    super.dispose();
  }

  Future<void> _loadTranscript({int? index}) async {
    if (loadingTranscript) return;
    setState(() {
      loadingTranscript = true;
      transcriptStatus = '正在读取 B站字幕…';
      if (index != null) trackIndex = index;
    });
    try {
      final data = await service.loadBiliSubtitles(
        videoController,
        trackIndex: trackIndex,
      );
      if (!mounted) return;
      setState(() {
        segments = data;
        bilingual = data.any((e) => e.translation?.isNotEmpty == true);
        transcriptStatus = data.isEmpty
            ? '当前视频没有可读取的 B站字幕'
            : '已读取 ${data.length} 条字幕';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => transcriptStatus = '字幕读取失败：$e');
    } finally {
      if (mounted) setState(() => loadingTranscript = false);
    }
  }

  Future<void> _loadOfficialSummary() async {
    if (introController.aiConclusionResult != null || loadingOfficial) return;
    setState(() => loadingOfficial = true);
    try {
      await introController.aiConclusion();
    } catch (_) {}
    if (mounted) setState(() => loadingOfficial = false);
  }

  Future<void> _openSettings() async {
    final result = await showDialog<AiDigestSettings>(
      context: context,
      builder: (context) => AiDigestSettingsDialog(initial: settings),
    );
    if (result != null && mounted) {
      await service.saveSettings(result);
      setState(() => settings = result);
    }
  }

  Future<void> _generateOverview() async {
    if (segments.isEmpty) {
      SmartDialog.showToast('请先获取字幕');
      tabController.animateTo(1);
      return;
    }
    if (!settings.aiConfigured) {
      SmartDialog.showToast('请先配置 AI 接口');
      await _openSettings();
      return;
    }
    setState(() => loadingOverview = true);
    try {
      final value = await service.generateOverview(settings, title, segments);
      if (mounted) setState(() => deepOverview = value);
    } catch (e) {
      SmartDialog.showToast('生成失败：$e');
    } finally {
      if (mounted) setState(() => loadingOverview = false);
    }
  }

  Future<void> _translate() async {
    if (segments.isEmpty) {
      SmartDialog.showToast('请先获取字幕');
      return;
    }
    if (!settings.aiConfigured) {
      SmartDialog.showToast('请先配置 AI 接口');
      await _openSettings();
      return;
    }
    if (translating) return;
    setState(() {
      translating = true;
      transcriptStatus = '正在翻译整段字幕…';
    });
    try {
      final value = await service.translateTranscript(settings, segments);
      if (!mounted) return;
      setState(() {
        segments = value;
        bilingual = true;
        transcriptStatus = '翻译完成，共 ${value.length} 条';
      });
    } catch (e) {
      SmartDialog.showToast('翻译失败：$e');
      if (mounted) setState(() => transcriptStatus = '翻译失败');
    } finally {
      if (mounted) setState(() => translating = false);
    }
  }

  Future<void> _generateAsr() async {
    if (generatingAsr) return;
    if (!settings.asrConfigured) {
      SmartDialog.showToast('请先配置 Groq API Key');
      await _openSettings();
      return;
    }
    setState(() {
      generatingAsr = true;
      asrProgress = 0;
      transcriptStatus = '正在准备 AI 字幕…';
    });
    try {
      final value = await service.generateGroqTranscript(
        videoController,
        settings,
        (value) {
          if (mounted) {
            setState(() {
              asrProgress = value.clamp(0, 1);
              transcriptStatus = value < 0.58
                  ? '正在下载低码率音轨 ${(value / 0.55 * 100).clamp(0, 100).toStringAsFixed(0)}%'
                  : '正在上传并转写 ${(value * 100).toStringAsFixed(0)}%';
            });
          }
        },
      );
      if (!mounted) return;
      setState(() {
        segments = value;
        transcriptStatus = 'AI 字幕生成完成，共 ${value.length} 条';
        asrProgress = 1;
      });
    } catch (e) {
      SmartDialog.showToast('AI 字幕失败：$e');
      if (mounted) setState(() => transcriptStatus = 'AI 字幕失败：$e');
    } finally {
      if (mounted) setState(() => generatingAsr = false);
    }
  }

  Future<void> _ask() async {
    final question = chatInput.text.trim();
    if (question.isEmpty || asking) return;
    if (segments.isEmpty) {
      SmartDialog.showToast('请先获取字幕');
      return;
    }
    if (!settings.aiConfigured) {
      SmartDialog.showToast('请先配置 AI 接口');
      await _openSettings();
      return;
    }
    final history = chat;
    setState(() {
      asking = true;
      chat = [...chat, AiDigestChatMessage(role: 'user', content: question)];
      chatInput.clear();
    });
    _scrollChat();
    try {
      final answer = await service.askVideo(
        settings,
        title,
        segments,
        history,
        question,
      );
      if (mounted) {
        setState(() {
          chat = [...chat, AiDigestChatMessage(role: 'assistant', content: answer)];
        });
        _scrollChat();
      }
    } catch (e) {
      SmartDialog.showToast('问答失败：$e');
    } finally {
      if (mounted) setState(() => asking = false);
    }
  }

  void _scrollChat() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (chatScroll.hasClients) {
        chatScroll.animateTo(
          chatScroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _saveNote() async {
    final text = noteInput.text.trim();
    if (text.isEmpty) return;
    final note = AiDigestNote(
      timeMs: videoController.plPlayerController.positionInMilliseconds,
      text: text,
      createdAt: DateTime.now().millisecondsSinceEpoch,
    );
    final next = [...notes, note]..sort((a, b) => a.timeMs.compareTo(b.timeMs));
    await service.saveNotes(videoController.bvid, videoController.cid.value, next);
    if (mounted) {
      setState(() {
        notes = next;
        noteInput.clear();
      });
    }
  }

  Future<void> _polishNote() async {
    final text = noteInput.text.trim();
    if (text.isEmpty || polishing) return;
    if (!settings.aiConfigured) {
      SmartDialog.showToast('请先配置 AI 接口');
      await _openSettings();
      return;
    }
    setState(() => polishing = true);
    try {
      final value = await service.polishNote(settings, text);
      if (mounted) noteInput.text = value;
    } catch (e) {
      SmartDialog.showToast('润色失败：$e');
    } finally {
      if (mounted) setState(() => polishing = false);
    }
  }

  Future<void> _deleteNote(AiDigestNote note) async {
    final next = notes.where((e) => e != note).toList();
    await service.saveNotes(videoController.bvid, videoController.cid.value, next);
    if (mounted) setState(() => notes = next);
  }

  void _seekSeconds(double seconds) {
    videoController.plPlayerController.seekTo(
      Duration(milliseconds: (seconds * 1000).round()),
      isSeek: false,
    );
  }

  void _seekMs(int ms) {
    videoController.plPlayerController.seekTo(
      Duration(milliseconds: ms),
      isSeek: false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            SizedBox(
              height: 24,
              child: Center(
                child: Container(
                  width: 36,
                  height: 3,
                  decoration: BoxDecoration(
                    color: colors.primary,
                    borderRadius: const BorderRadius.all(Radius.circular(8)),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 6, 4),
              child: Row(
                children: [
                  Icon(Icons.auto_awesome_rounded, size: 19, color: colors.primary),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'AI 视频助手',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                  ),
                  IconButton(
                    tooltip: 'AI 设置',
                    onPressed: _openSettings,
                    icon: const Icon(Icons.settings_outlined, size: 20),
                  ),
                  IconButton(
                    tooltip: '关闭',
                    onPressed: Get.back,
                    icon: const Icon(Icons.close_rounded, size: 21),
                  ),
                ],
              ),
            ),
            TabBar(
              controller: tabController,
              dividerHeight: 0,
              tabs: const [
                Tab(text: '概览'),
                Tab(text: '字幕'),
                Tab(text: '问答'),
                Tab(text: '笔记'),
              ],
            ),
            Divider(height: 1, color: colors.outlineVariant.withValues(alpha: 0.25)),
            Expanded(
              child: TabBarView(
                controller: tabController,
                children: [
                  _buildOverview(theme),
                  _buildTranscript(theme),
                  _buildChat(theme),
                  _buildNotes(theme),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionCard(ThemeData theme, {required Widget child}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLow,
          borderRadius: const BorderRadius.all(Radius.circular(14)),
          border: Border.all(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.25),
          ),
        ),
        child: child,
      );

  Widget _buildOverview(ThemeData theme) {
    final official = introController.aiConclusionResult;
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 120),
      children: [
        _sectionCard(
          theme,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'B站 AI 速览',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (loadingOfficial)
                    const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      tooltip: '重新获取',
                      onPressed: () async {
                        setState(() => loadingOfficial = true);
                        try {
                          introController.aiConclusionResult = null;
                          await introController.aiConclusion();
                        } finally {
                          if (mounted) setState(() => loadingOfficial = false);
                        }
                      },
                      icon: const Icon(Icons.refresh_rounded, size: 19),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              if (official == null)
                Text(
                  loadingOfficial ? '正在获取 B站官方 AI 总结…' : '这个视频暂时没有可用的 B站 AI 总结。',
                  style: TextStyle(color: theme.colorScheme.outline, height: 1.5),
                )
              else
                _officialContent(theme, official),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _sectionCard(
          theme,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.auto_awesome_rounded, size: 18, color: theme.colorScheme.primary),
                  const SizedBox(width: 7),
                  const Expanded(
                    child: Text(
                      '深度精读',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (deepOverview != null)
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      tooltip: '重新生成',
                      onPressed: loadingOverview ? null : _generateOverview,
                      icon: const Icon(Icons.refresh_rounded, size: 19),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              if (deepOverview == null) ...[
                Text(
                  segments.isEmpty
                      ? '先读取视频字幕，再用你配置的模型生成更完整的知识点与关键时间轴。'
                      : '已准备 ${segments.length} 条字幕，可以生成自定义模型的深度概览。',
                  style: TextStyle(color: theme.colorScheme.outline, height: 1.5),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: loadingOverview ? null : _generateOverview,
                  icon: loadingOverview
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome_rounded, size: 17),
                  label: Text(loadingOverview ? '生成中…' : '生成深度精读'),
                ),
              ] else
                SelectionArea(
                  child: Text(deepOverview!, style: const TextStyle(height: 1.6)),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _officialContent(ThemeData theme, AiConclusionResult official) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (official.summary?.isNotEmpty == true)
          SelectionArea(
            child: Text(official.summary!, style: const TextStyle(height: 1.55)),
          ),
        ...?official.outline?.map(
          (group) => Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (group.title?.isNotEmpty == true)
                  Text(group.title!, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 5),
                ...?group.partOutline?.map(
                  (part) => InkWell(
                    borderRadius: const BorderRadius.all(Radius.circular(8)),
                    onTap: part.timestamp == null
                        ? null
                        : () => _seekSeconds(part.timestamp!.toDouble()),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (part.timestamp != null)
                            Padding(
                              padding: const EdgeInsets.only(right: 8, top: 1),
                              child: Text(
                                service.formatSeconds(part.timestamp!.toDouble()),
                                style: TextStyle(
                                  color: theme.colorScheme.primary,
                                  fontFeatures: const [FontFeature.tabularFigures()],
                                ),
                              ),
                            ),
                          Expanded(
                            child: Text(part.content ?? '', style: const TextStyle(height: 1.45)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTranscript(ThemeData theme) {
    final tracks = videoController.subtitles;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 9, 8, 6),
          child: Row(
            children: [
              if (tracks.length > 1)
                Expanded(
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<int>(
                      isExpanded: true,
                      value: trackIndex.clamp(0, tracks.length - 1),
                      items: [
                        for (var i = 0; i < tracks.length; i++)
                          DropdownMenuItem(
                            value: i,
                            child: Text(
                              tracks[i].lanDoc ?? tracks[i].lan,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: loadingTranscript
                          ? null
                          : (value) {
                              if (value != null) _loadTranscript(index: value);
                            },
                    ),
                  ),
                )
              else
                const Spacer(),
              const SizedBox(width: 6),
              SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: false, label: Text('原文')),
                  ButtonSegment(value: true, label: Text('双语')),
                ],
                selected: {bilingual},
                onSelectionChanged: (value) {
                  final target = value.first;
                  if (target && !segments.any((e) => e.translation?.isNotEmpty == true)) {
                    _translate();
                    return;
                  }
                  setState(() => bilingual = target);
                },
              ),
              PopupMenuButton<String>(
                tooltip: '字幕操作',
                onSelected: (value) {
                  switch (value) {
                    case 'translate':
                      _translate();
                    case 'reload':
                      _loadTranscript();
                    case 'asr':
                      _generateAsr();
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(value: 'translate', child: Text('翻译全文')),
                  const PopupMenuItem(value: 'reload', child: Text('重新读取 B站字幕')),
                  const PopupMenuItem(value: 'asr', child: Text('用 Groq 生成 AI 字幕')),
                ],
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  transcriptStatus,
                  style: TextStyle(fontSize: 12, color: theme.colorScheme.outline),
                ),
              ),
              if (loadingTranscript || translating)
                const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
        ),
        if (generatingAsr)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
            child: LinearProgressIndicator(value: asrProgress == 0 ? null : asrProgress),
          ),
        Expanded(
          child: segments.isEmpty
              ? _emptyTranscript(theme)
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(10, 4, 10, 120),
                  itemCount: segments.length,
                  itemBuilder: (context, index) {
                    final item = segments[index];
                    final ms = currentMs / 1000;
                    final active = ms >= item.from && ms < item.to;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: InkWell(
                        borderRadius: const BorderRadius.all(Radius.circular(10)),
                        onTap: () => _seekSeconds(item.from),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 160),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                          decoration: BoxDecoration(
                            color: active
                                ? theme.colorScheme.secondaryContainer.withValues(alpha: 0.65)
                                : Colors.transparent,
                            borderRadius: const BorderRadius.all(Radius.circular(10)),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: 52,
                                child: Text(
                                  service.formatSeconds(item.from),
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: active
                                        ? theme.colorScheme.primary
                                        : theme.colorScheme.outline,
                                    fontFeatures: const [FontFeature.tabularFigures()],
                                  ),
                                ),
                              ),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(item.content, style: const TextStyle(height: 1.45)),
                                    if (bilingual && item.translation?.isNotEmpty == true) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        item.translation!,
                                        style: TextStyle(
                                          height: 1.45,
                                          color: theme.colorScheme.onSurfaceVariant,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _emptyTranscript(ThemeData theme) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.subtitles_off_outlined, size: 40, color: theme.colorScheme.outline),
              const SizedBox(height: 12),
              Text(transcriptStatus, textAlign: TextAlign.center),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  OutlinedButton.icon(
                    onPressed: loadingTranscript ? null : _loadTranscript,
                    icon: const Icon(Icons.refresh_rounded, size: 17),
                    label: const Text('重新读取'),
                  ),
                  FilledButton.icon(
                    onPressed: generatingAsr ? null : _generateAsr,
                    icon: const Icon(Icons.graphic_eq_rounded, size: 17),
                    label: const Text('生成 AI 字幕'),
                  ),
                ],
              ),
            ],
          ),
        ),
      );

  Widget _buildChat(ThemeData theme) {
    return Column(
      children: [
        Expanded(
          child: chat.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: Text(
                      segments.isEmpty
                          ? '先到“字幕”页获取字幕，然后就可以围绕当前视频提问。'
                          : '已载入 ${segments.length} 条字幕。\n可以问“这段视频的核心观点是什么？”或“03:20 之后讲了什么？”',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: theme.colorScheme.outline, height: 1.55),
                    ),
                  ),
                )
              : ListView.builder(
                  controller: chatScroll,
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 18),
                  itemCount: chat.length + (asking ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (index == chat.length) {
                      return const Padding(
                        padding: EdgeInsets.all(12),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      );
                    }
                    final item = chat[index];
                    final isUser = item.role == 'user';
                    return Align(
                      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 560),
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
                        decoration: BoxDecoration(
                          color: isUser
                              ? theme.colorScheme.primaryContainer
                              : theme.colorScheme.surfaceContainerHigh,
                          borderRadius: const BorderRadius.all(Radius.circular(14)),
                        ),
                        child: SelectionArea(
                          child: Text(item.content, style: const TextStyle(height: 1.5)),
                        ),
                      ),
                    );
                  },
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: chatInput,
                    minLines: 1,
                    maxLines: 5,
                    textInputAction: TextInputAction.newline,
                    decoration: const InputDecoration(
                      hintText: '基于当前视频字幕提问…',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.all(Radius.circular(14)),
                      ),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 7),
                IconButton.filled(
                  tooltip: '发送',
                  onPressed: asking ? null : _ask,
                  icon: const Icon(Icons.arrow_upward_rounded),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildNotes(ThemeData theme) {
    final now = videoController.plPlayerController.positionInMilliseconds;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
          child: TextField(
            controller: noteInput,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: '记下此刻的想法，保存后会带上时间戳…',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(14)),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
          child: Row(
            children: [
              ActionChip(
                avatar: const Icon(Icons.schedule_rounded, size: 16),
                label: Text(service.formatSeconds(now / 1000)),
                onPressed: null,
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: polishing ? null : _polishNote,
                icon: polishing
                    ? const SizedBox.square(
                        dimension: 15,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.auto_fix_high_rounded, size: 17),
                label: const Text('AI 润色'),
              ),
              const SizedBox(width: 6),
              FilledButton(onPressed: _saveNote, child: const Text('保存')),
            ],
          ),
        ),
        Divider(height: 1, color: theme.colorScheme.outlineVariant.withValues(alpha: 0.25)),
        Expanded(
          child: notes.isEmpty
              ? Center(
                  child: Text(
                    '还没有笔记',
                    style: TextStyle(color: theme.colorScheme.outline),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 120),
                  itemCount: notes.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final item = notes[index];
                    return _sectionCard(
                      theme,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TextButton(
                            onPressed: () => _seekMs(item.timeMs),
                            child: Text(service.formatSeconds(item.timeMs / 1000)),
                          ),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: SelectionArea(
                                child: Text(item.text, style: const TextStyle(height: 1.45)),
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: '删除',
                            onPressed: () => _deleteNote(item),
                            icon: const Icon(Icons.delete_outline_rounded, size: 19),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class AiDigestSettingsDialog extends StatefulWidget {
  const AiDigestSettingsDialog({super.key, required this.initial});
  final AiDigestSettings initial;

  @override
  State<AiDigestSettingsDialog> createState() => _AiDigestSettingsDialogState();
}

class _AiDigestSettingsDialogState extends State<AiDigestSettingsDialog> {
  final service = AiDigestService.instance;
  late final TextEditingController baseUrl;
  late final TextEditingController apiKey;
  late final TextEditingController model;
  late final TextEditingController groqKey;
  String reasoning = 'default';
  String groqModel = 'whisper-large-v3-turbo';
  String asrLanguage = 'auto';
  String translationLanguage = '简体中文';
  bool testing = false;
  bool obscureAi = true;
  bool obscureGroq = true;
  List<String> models = const [];
  String hint = '';

  @override
  void initState() {
    super.initState();
    final s = widget.initial;
    baseUrl = TextEditingController(text: s.baseUrl);
    apiKey = TextEditingController(text: s.apiKey);
    model = TextEditingController(text: s.model);
    groqKey = TextEditingController(text: s.groqApiKey);
    reasoning = s.reasoningEffort;
    groqModel = s.groqModel;
    asrLanguage = s.asrLanguage;
    translationLanguage = s.translationLanguage;
  }

  @override
  void dispose() {
    baseUrl.dispose();
    apiKey.dispose();
    model.dispose();
    groqKey.dispose();
    super.dispose();
  }

  AiDigestSettings get value => AiDigestSettings(
        baseUrl: baseUrl.text,
        apiKey: apiKey.text,
        model: model.text,
        reasoningEffort: reasoning,
        groqApiKey: groqKey.text,
        groqModel: groqModel,
        asrLanguage: asrLanguage,
        translationLanguage: translationLanguage,
      );

  Future<void> _testAndModels() async {
    if (testing) return;
    setState(() {
      testing = true;
      hint = '正在连接…';
    });
    try {
      final list = await service.listModels(value);
      if (!mounted) return;
      setState(() {
        models = list;
        hint = list.isEmpty ? '连接成功，但没有返回模型列表' : '连接成功，发现 ${list.length} 个模型';
      });
    } catch (e) {
      if (mounted) setState(() => hint = '连接失败：$e');
    } finally {
      if (mounted) setState(() => testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('AI 设置'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('OpenAI 兼容接口', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              TextField(
                controller: baseUrl,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'Base URL',
                  hintText: 'https://api.example.com/v1',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: apiKey,
                obscureText: obscureAi,
                decoration: InputDecoration(
                  labelText: 'API Key',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => obscureAi = !obscureAi),
                    icon: Icon(obscureAi ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              if (models.isEmpty)
                TextField(
                  controller: model,
                  decoration: const InputDecoration(
                    labelText: '模型',
                    hintText: '例如 deepseek-chat',
                    border: OutlineInputBorder(),
                  ),
                )
              else
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  value: models.contains(model.text) ? model.text : null,
                  decoration: const InputDecoration(labelText: '模型', border: OutlineInputBorder()),
                  items: models.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
                  onChanged: (value) {
                    if (value != null) model.text = value;
                  },
                ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: reasoning,
                decoration: const InputDecoration(labelText: '思考等级', border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'default', child: Text('跟随服务默认')),
                  DropdownMenuItem(value: 'off', child: Text('关闭 / 不传参数')),
                  DropdownMenuItem(value: 'low', child: Text('低')),
                  DropdownMenuItem(value: 'medium', child: Text('中')),
                  DropdownMenuItem(value: 'high', child: Text('高')),
                ],
                onChanged: (value) => setState(() => reasoning = value ?? 'default'),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: testing ? null : _testAndModels,
                    icon: testing
                        ? const SizedBox.square(
                            dimension: 15,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.cloud_sync_outlined, size: 17),
                    label: const Text('测试连接并拉取模型'),
                  ),
                ],
              ),
              if (hint.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(hint, style: Theme.of(context).textTheme.bodySmall),
              ],
              const SizedBox(height: 22),
              const Text('AI 字幕 · Groq', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              TextField(
                controller: groqKey,
                obscureText: obscureGroq,
                decoration: InputDecoration(
                  labelText: 'Groq API Key',
                  hintText: 'gsk_…',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => obscureGroq = !obscureGroq),
                    icon: Icon(obscureGroq ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: groqModel,
                decoration: const InputDecoration(labelText: '转写模型', border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'whisper-large-v3-turbo', child: Text('Whisper Large V3 Turbo')),
                  DropdownMenuItem(value: 'whisper-large-v3', child: Text('Whisper Large V3')),
                ],
                onChanged: (value) => setState(() => groqModel = value ?? groqModel),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: asrLanguage,
                decoration: const InputDecoration(labelText: '主要语言', border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'auto', child: Text('自动检测')),
                  DropdownMenuItem(value: 'zh', child: Text('中文')),
                  DropdownMenuItem(value: 'en', child: Text('English')),
                  DropdownMenuItem(value: 'ja', child: Text('日本語')),
                ],
                onChanged: (value) => setState(() => asrLanguage = value ?? 'auto'),
              ),
              const SizedBox(height: 22),
              const Text('翻译', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              TextFormField(
                initialValue: translationLanguage,
                decoration: const InputDecoration(
                  labelText: '目标语言',
                  border: OutlineInputBorder(),
                ),
                onChanged: (value) => translationLanguage = value,
              ),
              const SizedBox(height: 10),
              Text(
                'API Key 当前保存在 PiliPlus AI 独立应用的本地 Hive 数据中；由于包名独立，不会与原 PiliPlus 共用配置。',
                style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: Get.back, child: const Text('取消')),
        FilledButton(onPressed: () => Get.back(result: value), child: const Text('保存')),
      ],
    );
  }
}
