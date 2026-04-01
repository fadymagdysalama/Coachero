import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgressStore } from '../../src/stores/progressStore';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

type Section = 'measurements' | 'strength' | 'photos' | 'programs';

interface ProgramProgressItem {
  programId: string;
  programTitle: string;
  totalDays: number;
  currentDay: number;
  days: Array<{ id: string; day_number: number }>;
  completedDayIds: string[];
  feedbacks: Array<{ day_id: string; text: string | null }>;
}

function SparkChart({ data, color = colors.primary }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const HEIGHT = 48;
  const BAR_W = 7;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: HEIGHT, gap: 3 }}>
      {data.map((v, i) => {
        const h = Math.max(4, ((v - min) / range) * HEIGHT);
        const isLast = i === data.length - 1;
        return (
          <View
            key={i}
            style={{
              width: BAR_W,
              height: h,
              backgroundColor: isLast ? color : `${color}55`,
              borderRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}

export default function ClientProgressScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { clientId, clientName } = useLocalSearchParams<{
    clientId: string;
    clientName: string;
  }>();

  const { measurements, strengthLogs, photos, fetchMeasurements, fetchStrengthLogs, fetchPhotos, isLoading } =
    useProgressStore();

  const [section, setSection] = useState<Section>('programs');
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ url: string; label: string; date: string } | null>(null);
  const [programsProgress, setProgramsProgress] = useState<ProgramProgressItem[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);

  const loadProgramsProgress = async () => {
    if (!clientId) return;
    setProgramsLoading(true);
    const { data: assignments } = await supabase
      .from('program_assignments')
      .select('id, program_id, current_day, program:programs(id, title, duration_days)')
      .eq('client_id', clientId)
      .order('started_at', { ascending: false });

    if (!assignments || assignments.length === 0) {
      setProgramsProgress([]);
      setProgramsLoading(false);
      return;
    }

    const results = await Promise.all(
      (assignments as any[])
        .filter((a) => a.program != null)
        .map(async (a) => {
          const [daysRes, logsRes, feedbackRes] = await Promise.all([
            supabase.from('program_days').select('id, day_number').eq('program_id', a.program_id).order('day_number', { ascending: true }),
            supabase.from('workout_logs').select('day_id').eq('client_id', clientId).eq('program_id', a.program_id),
            supabase.from('client_feedback').select('day_id, text').eq('client_id', clientId).eq('program_id', a.program_id),
          ]);
          return {
            programId: a.program_id as string,
            programTitle: a.program.title as string,
            totalDays: a.program.duration_days as number,
            currentDay: a.current_day as number,
            days: (daysRes.data ?? []) as Array<{ id: string; day_number: number }>,
            completedDayIds: (logsRes.data ?? []).map((l: any) => l.day_id as string),
            feedbacks: (feedbackRes.data ?? []) as Array<{ day_id: string; text: string | null }>,
          };
        })
    );
    setProgramsProgress(results);
    setProgramsLoading(false);
  };

  useEffect(() => {
    if (!clientId) return;
    fetchMeasurements(clientId);
    fetchStrengthLogs(clientId);
    fetchPhotos(clientId);
    loadProgramsProgress();
  }, [clientId]);

  const sections: { key: Section; label: string }[] = [
    { key: 'programs', label: t('progress.programs') },
    { key: 'measurements', label: t('progress.measurements') },
    { key: 'strength', label: t('progress.strength') },
    { key: 'photos', label: t('progress.photos') },
  ];

  const labelKey = (label: string) =>
    `progress.label${label.charAt(0).toUpperCase()}${label.slice(1)}` as any;

  // Derived data
  const latest = measurements[0] ?? null;
  const weights = measurements
    .slice()
    .reverse()
    .map((m) => m.weight_kg)
    .filter((v): v is number => v != null);

  const exercises = Array.from(new Set(strengthLogs.map((l) => l.exercise_name)));
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const activeExercise = selectedExercise ?? exercises[0] ?? null;
  const chartWeights = strengthLogs
    .filter((l) => l.exercise_name === activeExercise)
    .slice()
    .reverse()
    .map((l) => l.weight_kg);
  const prs = exercises
    .map((ex) => strengthLogs.find((l) => l.exercise_name === ex && l.is_pr))
    .filter(Boolean);

  const handleTabChange = (tab: Section) => {
    setSection(tab);
    if (tab === 'programs') {
      loadProgramsProgress();
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Fullscreen photo viewer */}
      <Modal
        visible={fullscreenPhoto !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          <StatusBar hidden />
          <TouchableOpacity style={styles.modalClose} onPress={() => setFullscreenPhoto(null)}>
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          {fullscreenPhoto && (
            <>
              <Image
                source={{ uri: fullscreenPhoto.url }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
              <View style={styles.modalMeta}>
                <Text style={styles.modalLabel}>{t(labelKey(fullscreenPhoto.label))}</Text>
                <Text style={styles.modalDate}>{fullscreenPhoto.date}</Text>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('progress.clientProgress')}</Text>
        {clientName ? <Text style={styles.clientName}>{clientName}</Text> : null}
      </View>

      {/* Scrollable pill tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillScroll}
        contentContainerStyle={styles.tabBarContent}
      >
        {sections.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tabPill, section === s.key && styles.tabPillActive]}
            onPress={() => handleTabChange(s.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabPillText, section === s.key && styles.tabPillTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} style={styles.contentScroll}>
        {/* ─── Measurements ─────────────────────────────────────────────── */}
        {section === 'measurements' && (
          <View>
            {isLoading && measurements.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : measurements.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>⚖️</Text>
                <Text style={styles.emptyText}>{t('progress.noMeasurements')}</Text>
              </View>
            ) : (
              <>
                {latest && (
                  <View style={styles.statsCard}>
                    <Text style={styles.statsCardTitle}>{t('progress.latest')}</Text>
                    <View style={styles.statRow}>
                      {latest.weight_kg != null && (
                        <View style={styles.statItem}>
                          <Text style={styles.statValue}>{latest.weight_kg}</Text>
                          <Text style={styles.statLabel}>{t('progress.weightKg')} kg</Text>
                        </View>
                      )}
                      {latest.body_fat_pct != null && (
                        <View style={styles.statItem}>
                          <Text style={styles.statValue}>{latest.body_fat_pct}%</Text>
                          <Text style={styles.statLabel}>{t('progress.bodyFat')}</Text>
                        </View>
                      )}
                      {latest.muscle_mass_kg != null && (
                        <View style={styles.statItem}>
                          <Text style={styles.statValue}>{latest.muscle_mass_kg}</Text>
                          <Text style={styles.statLabel}>{t('progress.muscleMass')} kg</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {weights.length >= 2 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartLabel}>{t('progress.weightTrend')}</Text>
                    <SparkChart data={weights} color={colors.primary} />
                    <View style={styles.chartRange}>
                      <Text style={styles.chartMin}>{Math.min(...weights)} kg</Text>
                      <Text style={styles.chartMax}>{Math.max(...weights)} kg</Text>
                    </View>
                  </View>
                )}

                {measurements.map((m) => (
                  <View key={m.id} style={styles.logRow}>
                    <Text style={styles.logDate}>{m.date}</Text>
                    <View style={styles.logStats}>
                      {m.weight_kg != null && <Text style={styles.logStat}>{m.weight_kg} kg</Text>}
                      {m.body_fat_pct != null && <Text style={styles.logStat}>{m.body_fat_pct}% fat</Text>}
                      {m.muscle_mass_kg != null && <Text style={styles.logStat}>{m.muscle_mass_kg} kg muscle</Text>}
                    </View>
                    {m.notes ? <Text style={styles.logNotes}>{m.notes}</Text> : null}
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ─── Strength ─────────────────────────────────────────────────── */}
        {section === 'strength' && (
          <View>
            {isLoading && strengthLogs.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : strengthLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🏋️</Text>
                <Text style={styles.emptyText}>{t('progress.noStrength')}</Text>
              </View>
            ) : (
              <>
                {prs.length > 0 && (
                  <View style={styles.prBanner}>
                    <Text style={styles.prBannerTitle}>🏆 {t('progress.personalRecords')}</Text>
                    {prs.map((pr) => pr && (
                      <View key={pr.id} style={styles.prBannerRow}>
                        <Text style={styles.prBannerExercise}>{pr.exercise_name}</Text>
                        <Text style={styles.prBannerWeight}>{pr.weight_kg} kg</Text>
                      </View>
                    ))}
                  </View>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.exercisePicker}
                  contentContainerStyle={{ gap: spacing.sm }}
                >
                  {exercises.map((ex) => (
                    <TouchableOpacity
                      key={ex}
                      style={[
                        styles.exerciseChip,
                        activeExercise === ex && styles.exerciseChipActive,
                      ]}
                      onPress={() => setSelectedExercise(ex)}
                    >
                      <Text
                        style={[
                          styles.exerciseChipText,
                          activeExercise === ex && styles.exerciseChipTextActive,
                        ]}
                      >
                        {ex}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {chartWeights.length >= 2 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartLabel}>{t('progress.strengthTrend')}</Text>
                    <SparkChart data={chartWeights} color={colors.success} />
                    <View style={styles.chartRange}>
                      <Text style={styles.chartMin}>{Math.min(...chartWeights)} kg</Text>
                      <Text style={styles.chartMax}>{Math.max(...chartWeights)} kg</Text>
                    </View>
                  </View>
                )}

                {strengthLogs
                  .filter((l) => l.exercise_name === activeExercise)
                  .map((log) => (
                    <View
                      key={log.id}
                      style={[styles.logRow, log.is_pr && styles.logRowPR]}
                    >
                      <View style={styles.logRowHeader}>
                        <Text style={styles.logDate}>{log.date}</Text>
                        {log.is_pr && (
                          <View style={styles.prBadgeContainer}>
                            <Text style={styles.prBadgeText}>{t('progress.prBadge')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.logStat}>
                        {log.weight_kg} kg · {log.sets} × {log.reps}
                      </Text>
                    </View>
                  ))}
              </>
            )}
          </View>
        )}

        {/* ─── Photos ───────────────────────────────────────────────────── */}
        {section === 'photos' && (
          <View>
            {isLoading && photos.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : photos.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📸</Text>
                <Text style={styles.emptyText}>{t('progress.noPhotos')}</Text>
              </View>
            ) : (
              <View style={styles.photoGrid}>
                {photos.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.photoCard}
                    onPress={() => setFullscreenPhoto({ url: p.photo_url, label: p.label, date: p.date })}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: p.photo_url }}
                      style={styles.photoImage}
                      resizeMode="cover"
                    />
                    <View style={styles.photoMeta}>
                      <Text style={styles.photoLabel}>{t(labelKey(p.label))}</Text>
                      <Text style={styles.photoDate}>{p.date}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ─── Programs ─────────────────────────────────────────────────── */}
        {section === 'programs' && (
          <View>
            {programsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : programsProgress.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyText}>{t('progress.noProgramsAssigned')}</Text>
              </View>
            ) : (
              programsProgress.map((prog) => {
                const donePct = Math.min(
                  (prog.completedDayIds.length / Math.max(prog.totalDays, 1)) * 100,
                  100,
                );
                return (
                  <View key={prog.programId} style={styles.progCard}>
                    <View style={styles.progCardHeader}>
                      <Text style={styles.progCardTitle} numberOfLines={1}>
                        {prog.programTitle}
                      </Text>
                      <Text style={styles.progCardMeta}>
                        {t('progress.completedOf', { done: prog.completedDayIds.length, total: prog.totalDays })}
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(donePct)}%` as any }]} />
                    </View>
                    <View style={styles.daysList}>
                      {prog.days.map((day) => {
                        const done = prog.completedDayIds.includes(day.id);
                        const feedback = prog.feedbacks.find((f) => f.day_id === day.id);
                        return (
                          <View key={day.id} style={styles.dayRow}>
                            <View style={[styles.dayDot, done && styles.dayDotDone]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.dayRowText, done && styles.dayRowTextDone]}>
                                Day {day.day_number}{done ? '  ✓' : ''}
                              </Text>
                              {feedback?.text ? (
                                <Text style={styles.dayFeedback} numberOfLines={2}>
                                  "{feedback.text}"
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { marginBottom: 0 },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  clientName: { fontSize: fontSize.sm, color: colors.textMuted },

  // Scrollable pill tabs
  pillScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabBar: {
    backgroundColor: 'transparent',
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    alignItems: 'center',
  },
  tabPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabPillText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabPillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  contentScroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing['2xl'], paddingBottom: 60, paddingTop: spacing.sm },

  emptyState: { alignItems: 'center', paddingVertical: spacing['4xl'] },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },

  statsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  statsCardTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  statRow: { flexDirection: 'row', gap: spacing['2xl'] },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },

  chartCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  chartLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  chartRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  chartMin: { fontSize: fontSize.xs, color: colors.textMuted },
  chartMax: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },

  logRow: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  logRowPR: { borderColor: colors.warning, backgroundColor: `${colors.warning}0A` },
  logRowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logDate: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  logStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  logStat: { fontSize: fontSize.sm, color: colors.textSecondary },
  logNotes: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },

  prBadgeContainer: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  prBadgeText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700' },

  prBanner: {
    backgroundColor: `${colors.warning}12`,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: `${colors.warning}35`,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  prBannerTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.warning },
  prBannerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prBannerExercise: { fontSize: fontSize.sm, color: colors.text },
  prBannerWeight: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },

  exercisePicker: { marginBottom: spacing.md },
  exerciseChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  exerciseChipText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  exerciseChipTextActive: { color: colors.textInverse },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photoImage: { width: '100%', aspectRatio: 1 },
  photoMeta: { padding: spacing.sm },
  photoLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  photoDate: { fontSize: fontSize.xs, color: colors.textMuted },

  // Fullscreen photo modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 60,
    right: spacing['2xl'],
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalCloseText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  fullscreenImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.72,
  },
  modalMeta: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  modalLabel: { fontSize: fontSize.md, color: '#fff', fontWeight: '600' },
  modalDate: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  // Programs tab
  progCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  progCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progCardTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.sm,
  },
  progCardMeta: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  daysList: { gap: spacing.sm, marginTop: spacing.xs },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 3,
    flexShrink: 0,
  },
  dayDotDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  dayRowText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  dayRowTextDone: {
    color: colors.text,
    fontWeight: '600',
  },
  dayFeedback: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
