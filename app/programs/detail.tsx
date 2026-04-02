import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '../../src/stores/programStore';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';
import type { ProgramExercise } from '../../src/types';

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: colors.success,
  intermediate: colors.warning,
  advanced: colors.error,
};

const SS_COLOR = '#EA580C';
const getSupersetLetter = (group: number) =>
  String.fromCharCode(64 + ((group - 1) % 26) + 1);

// ─── Group consecutive exercises with shared superset_group ────────────────────
type ExSegment =
  | { type: 'single'; exercise: ProgramExercise; idx: number }
  | { type: 'superset'; group: number; label: string; exercises: Array<{ ex: ProgramExercise; idx: number }> };

function groupExercises(exercises: ProgramExercise[]): ExSegment[] {
  const segments: ExSegment[] = [];
  const visited = new Set<string>();
  exercises.forEach((ex, idx) => {
    if (visited.has(ex.id)) return;
    const sg = ex.superset_group;
    if (sg !== null && sg !== undefined) {
      const members = exercises
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.superset_group === sg && !visited.has(e.id));
      members.forEach(({ e }) => visited.add(e.id));
      segments.push({
        type: 'superset',
        group: sg,
        label: getSupersetLetter(sg),
        exercises: members.map(({ e, i }) => ({ ex: e, idx: i })),
      });
    } else {
      visited.add(ex.id);
      segments.push({ type: 'single', exercise: ex, idx });
    }
  });
  return segments;
}

// ─── Single exercise card (shared renderer) ────────────────────────────────────
function ExerciseCard({
  ex,
  idx,
  inSuperset = false,
}: {
  ex: ProgramExercise;
  idx: number;
  inSuperset?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.exerciseCard, inSuperset && detailStyles.exerciseCardInSuperset]}>
      <View style={styles.exerciseTop}>
        <View style={styles.exerciseIndex}>
          <Text style={styles.exerciseIndexText}>{idx + 1}</Text>
        </View>
        <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
      </View>
      <View style={styles.exerciseMeta}>
        <View style={styles.statChip}>
          <Text style={styles.statChipText}>
            {t('programs.sets_reps', { sets: ex.sets, reps: ex.reps })}
          </Text>
        </View>
        {!!ex.rest_time && (
          <View style={styles.statChip}>
            <Text style={styles.statChipText}>
              {t('programs.rest', { time: ex.rest_time })}
            </Text>
          </View>
        )}
      </View>
      {!!ex.notes && (
        <Text style={styles.exerciseNotes}>{ex.notes}</Text>
      )}
      {!!(ex as any).video_url && (
        <TouchableOpacity
          style={styles.videoLink}
          onPress={() => Linking.openURL((ex as any).video_url)}
        >
          <Text style={styles.videoLinkText}>▶ {t('programs.watchVideo')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ProgramDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentProgram, isLoading, fetchProgramWithDays, completedDayIds, fetchCompletedDays, logWorkout, submitFeedback, fetchProgramFeedback } = useProgramStore();
  const { profile } = useAuthStore();
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [markingDay, setMarkingDay] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, { id: string; text: string | null }>>({});
  const [feedbackEditing, setFeedbackEditing] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  const isCoach = profile?.role === 'coach';

  useEffect(() => {
    if (id) {
      fetchProgramWithDays(id);
      if (!isCoach) {
        fetchCompletedDays(id);
        fetchProgramFeedback(id).then(({ feedbacks: data }) => {
          const map: Record<string, { id: string; text: string | null }> = {};
          for (const f of data) { map[f.day_id] = { id: f.id, text: f.text }; }
          setFeedbacks(map);
        });
      }
    }
  }, [id]);

  useEffect(() => {
    // Auto-expand first day
    if (currentProgram?.days?.length) {
      setExpandedDay(currentProgram.days[0].id);
    }
  }, [currentProgram?.id]);

  if (isLoading || !currentProgram) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const diffColor = DIFFICULTY_COLOR[currentProgram.difficulty] ?? colors.accent;

  const handleMarkComplete = async (dayId: string) => {
    setMarkingDay(dayId);
    const { error } = await logWorkout(currentProgram.id, dayId);
    setMarkingDay(null);
    if (error) Alert.alert(t('common.error'), error);
  };

  const handleEditFeedback = (dayId: string) => {
    setFeedbackEditing(dayId);
    setFeedbackDraft(feedbacks[dayId]?.text ?? '');
  };

  const handleSaveFeedback = async (dayId: string) => {
    if (!currentProgram) return;
    setSavingFeedback(true);
    const { error } = await submitFeedback(currentProgram.id, dayId, feedbackDraft.trim());
    setSavingFeedback(false);
    if (error) {
      Alert.alert(t('common.error'), error);
    } else {
      setFeedbacks((prev) => ({ ...prev, [dayId]: { ...prev[dayId], text: feedbackDraft.trim() } }));
      setFeedbackEditing(null);
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {isCoach && (
            <TouchableOpacity
              style={styles.editHeaderBtn}
              onPress={() => router.push({ pathname: '/programs/edit', params: { id: currentProgram.id } })}
            >
              <Text style={styles.editHeaderBtnText}>{t('programs.editProgram')}</Text>
            </TouchableOpacity>
          )}
          {isCoach && (
            <TouchableOpacity
              style={styles.assignHeaderBtn}
              onPress={() => router.push({ pathname: '/programs/assign', params: { id: currentProgram.id } })}
            >
              <Text style={styles.assignHeaderBtnText}>{t('programs.assignToClient')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Program info card */}
        <View style={styles.infoCard}>
          <Text style={styles.programTitle}>{currentProgram.title}</Text>
          {!!currentProgram.description && (
            <Text style={styles.programDesc}>{currentProgram.description}</Text>
          )}
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: `${diffColor}18` }]}>
              <Text style={[styles.badgeText, { color: diffColor }]}>
                {t(`programs.${currentProgram.difficulty}` as any)}
              </Text>
            </View>
            <Text style={styles.metaText}>
              {t('programs.days', { count: currentProgram.duration_days })}
            </Text>
          </View>
        </View>

        {/* Days */}
        <Text style={styles.sectionTitle}>{t('programs.step2')}</Text>
        {currentProgram.days.map((day) => (
          <View key={day.id} style={styles.dayCard}>
            <TouchableOpacity
              style={styles.dayHeader}
              onPress={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
            >
              <Text style={styles.dayTitle}>
                {t('programs.day', { number: day.day_number })}
              </Text>
              <View style={styles.dayHeaderRight}>
                {!isCoach && completedDayIds.has(day.id) && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>✓ {t('programs.completed')}</Text>
                  </View>
                )}
                <Text style={styles.dayMeta}>
                  {day.exercises.length} {t('programs.exercises')}  {expandedDay === day.id ? '▲' : '▼'}
                </Text>
              </View>
            </TouchableOpacity>

            {expandedDay === day.id && (
              <View style={styles.dayBody}>
                {day.exercises.length === 0 ? (
                  <Text style={styles.noExText}>{t('programs.noExercises')}</Text>
                ) : (
                  groupExercises(day.exercises).map((segment, segIdx) => {
                    if (segment.type === 'superset') {
                      return (
                        <View key={`ss-${segment.group}-${segIdx}`} style={detailStyles.supersetBlock}>
                          <View style={detailStyles.supersetHeader}>
                            <View style={detailStyles.supersetHeaderLine} />
                            <View style={detailStyles.supersetHeaderPill}>
                              <Text style={detailStyles.supersetHeaderText}>
                                ⚡ {t('programs.supersetLabel', { label: segment.label })}
                              </Text>
                            </View>
                            <View style={detailStyles.supersetHeaderLine} />
                          </View>
                          {segment.exercises.map(({ ex, idx }, ssIdx) => (
                            <React.Fragment key={ex.id}>
                              <ExerciseCard ex={ex} idx={idx} inSuperset />
                              {ssIdx < segment.exercises.length - 1 && (
                                <View style={detailStyles.supersetDivider}>
                                  <Text style={detailStyles.supersetDividerText}>↩ continue</Text>
                                </View>
                              )}
                            </React.Fragment>
                          ))}
                        </View>
                      );
                    }
                    return <ExerciseCard key={segment.exercise.id} ex={segment.exercise} idx={segment.idx} />;
                  })
                )}
                {/* Mark Complete button – clients only */}
                {!isCoach && (
                  <TouchableOpacity
                    style={[
                      styles.markCompleteBtn,
                      completedDayIds.has(day.id) && styles.markCompleteBtnDone,
                    ]}
                    onPress={() => !completedDayIds.has(day.id) && handleMarkComplete(day.id)}
                    activeOpacity={completedDayIds.has(day.id) ? 1 : 0.7}
                    disabled={markingDay === day.id}
                  >
                    {markingDay === day.id ? (
                      <ActivityIndicator size="small" color={colors.surface} />
                    ) : (
                      <Text style={[
                        styles.markCompleteBtnText,
                        completedDayIds.has(day.id) && styles.markCompleteBtnTextDone,
                      ]}>
                        {completedDayIds.has(day.id)
                          ? `✓ ${t('programs.completed')}`
                          : t('programs.markComplete')}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Client feedback per day */}
                {!isCoach && (
                  <View style={styles.feedbackSection}>
                    <Text style={styles.feedbackSectionTitle}>{t('programs.yourFeedback')}</Text>
                    {feedbackEditing === day.id ? (
                      <View>
                        <TextInput
                          style={styles.feedbackInput}
                          value={feedbackDraft}
                          onChangeText={setFeedbackDraft}
                          placeholder={t('programs.feedbackPlaceholder')}
                          placeholderTextColor={colors.textMuted}
                          multiline
                          numberOfLines={3}
                        />
                        <View style={styles.feedbackActions}>
                          <TouchableOpacity
                            style={styles.feedbackCancelBtn}
                            onPress={() => setFeedbackEditing(null)}
                          >
                            <Text style={styles.feedbackCancelText}>{t('common.cancel')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.feedbackSaveBtn, savingFeedback && styles.feedbackSaveBtnDisabled]}
                            onPress={() => handleSaveFeedback(day.id)}
                            disabled={savingFeedback}
                          >
                            {savingFeedback ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.feedbackSaveText}>{t('common.save')}</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : feedbacks[day.id]?.text ? (
                      <View style={styles.feedbackCard}>
                        <Text style={styles.feedbackText}>"{feedbacks[day.id].text}"</Text>
                        <TouchableOpacity onPress={() => handleEditFeedback(day.id)}>
                          <Text style={styles.feedbackEditText}>{t('programs.editFeedback')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.feedbackAddBtn}
                        onPress={() => handleEditFeedback(day.id)}
                      >
                        <Text style={styles.feedbackAddText}>+ {t('programs.leaveFeedback')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: 60, paddingBottom: spacing.lg, paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editHeaderBtn: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  editHeaderBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  assignHeaderBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  assignHeaderBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textInverse },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing['2xl'], paddingBottom: 80, gap: spacing.md },

  // Info card
  infoCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  programTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  programDesc: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  metaText: { fontSize: fontSize.sm, color: colors.textMuted },
  badge: { borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600' },

  // Section
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Day card
  dayCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  dayTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  dayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  completedBadge: {
    backgroundColor: `${colors.success}18`,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  completedBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.success },
  dayBody: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, gap: spacing.sm },
  noExText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // Mark complete button
  markCompleteBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  markCompleteBtnDone: {
    backgroundColor: `${colors.success}18`,
    borderWidth: 1,
    borderColor: colors.success,
  },
  markCompleteBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#ffffff' },
  markCompleteBtnTextDone: { color: colors.success },

  // Exercise card
  exerciseCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    padding: spacing.sm, gap: spacing.xs,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exerciseIndex: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: `${colors.primary}18`, alignItems: 'center', justifyContent: 'center',
  },
  exerciseIndexText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  exerciseName: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  exerciseMeta: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  statChip: {
    backgroundColor: colors.card, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  statChipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  exerciseNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  videoLink: {
    marginTop: spacing.xs,
    backgroundColor: `${colors.error}10`,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: `${colors.error}30`,
  },
  videoLinkText: { fontSize: fontSize.xs, fontWeight: '700', color: '#CC0000' },

  // Client feedback
  feedbackSection: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  feedbackSectionTitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feedbackCard: {
    backgroundColor: `${colors.primary}08`,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
    gap: spacing.xs,
  },
  feedbackText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  feedbackEditText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  feedbackAddBtn: { paddingVertical: spacing.xs },
  feedbackAddText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '500' },
  feedbackInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  feedbackActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    justifyContent: 'flex-end',
  },
  feedbackCancelBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedbackCancelText: { fontSize: fontSize.sm, color: colors.textSecondary },
  feedbackSaveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  feedbackSaveBtnDisabled: { opacity: 0.6 },
  feedbackSaveText: { fontSize: fontSize.sm, color: '#fff', fontWeight: '600' },
});

// Superset-specific styles for the detail view
const detailStyles = StyleSheet.create({
  // Superset block wrapper
  supersetBlock: {
    borderWidth: 1.5,
    borderColor: SS_COLOR,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#FFF7ED',
    gap: 0,
  },
  supersetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: `${SS_COLOR}18`,
  },
  supersetHeaderLine: { flex: 1, height: 1, backgroundColor: `${SS_COLOR}50` },
  supersetHeaderPill: {
    backgroundColor: SS_COLOR,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  supersetHeaderText: { fontSize: fontSize.xs, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  // Exercises inside a superset card don't need their own border
  exerciseCardInSuperset: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: `${SS_COLOR}30`,
  },
  // Divider between two exercises inside a superset
  supersetDivider: {
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: `${SS_COLOR}10`,
  },
  supersetDividerText: { fontSize: fontSize.xs, color: SS_COLOR, fontWeight: '600' },
});
