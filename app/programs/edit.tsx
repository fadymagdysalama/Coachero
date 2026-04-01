import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useProgramStore } from '../../src/stores/programStore';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants/theme';

type Difficulty = 'beginner' | 'intermediate' | 'advanced';

interface ExerciseDraft {
  id: string | null; // null = newly added, not yet in DB
  key: string;
  exercise_name: string;
  sets: string;
  reps: string;
  rest_time: string;
  notes: string;
  video_url: string;
  order_index: number;
}

interface DayDraft {
  id: string;
  day_number: number;
  exercises: ExerciseDraft[];
}

function moveItem<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (toIndex < 0 || toIndex >= arr.length) return arr;
  const result = [...arr];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return result;
}

export default function EditProgramScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    currentProgram, isLoading, fetchProgramWithDays,
    updateProgram, updateExercise, addExercise, deleteExercise,
  } = useProgramStore();

  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [days, setDays] = useState<DayDraft[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchProgramWithDays(id);
  }, [id]);

  useEffect(() => {
    if (!currentProgram) return;
    setTitle(currentProgram.title);
    setDescription(currentProgram.description ?? '');
    setDifficulty(currentProgram.difficulty as Difficulty);
    const drafts: DayDraft[] = (currentProgram.days ?? []).map((day) => ({
      id: day.id,
      day_number: day.day_number,
      exercises: day.exercises.map((ex, i) => ({
        id: ex.id,
        key: ex.id,
        exercise_name: ex.exercise_name,
        sets: String(ex.sets),
        reps: ex.reps,
        rest_time: (ex as any).rest_time ?? '',
        notes: (ex as any).notes ?? '',
        video_url: (ex as any).video_url ?? '',
        order_index: (ex as any).order_index ?? i,
      })),
    }));
    setDays(drafts);
    if (drafts.length) setExpandedDay(drafts[0].id);
  }, [currentProgram?.id]);

  const updateLocal = (dayId: string, exKey: string, field: keyof ExerciseDraft, value: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id !== dayId ? d : {
          ...d,
          exercises: d.exercises.map((e) => e.key !== exKey ? e : { ...e, [field]: value }),
        }
      )
    );
  };

  const addLocal = (dayId: string) => {
    const newEx: ExerciseDraft = {
      id: null,
      key: `new-${Date.now()}`,
      exercise_name: '',
      sets: '3',
      reps: '10',
      rest_time: '60s',
      notes: '',
      video_url: '',
      order_index: 0,
    };
    setDays((prev) =>
      prev.map((d) => d.id !== dayId ? d : { ...d, exercises: [...d.exercises, newEx] })
    );
  };

  const removeLocal = async (dayId: string, exKey: string, exId: string | null) => {
    if (exId) {
      const { error } = await deleteExercise(exId);
      if (error) { Alert.alert(t('common.error'), error); return; }
    }
    setDays((prev) =>
      prev.map((d) =>
        d.id !== dayId ? d : { ...d, exercises: d.exercises.filter((e) => e.key !== exKey) }
      )
    );
  };

  // Move an exercise up or down within a day
  const moveExercise = (dayId: string, exKey: string, direction: 'up' | 'down') => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const idx = d.exercises.findIndex((e) => e.key === exKey);
        const toIdx = direction === 'up' ? idx - 1 : idx + 1;
        return { ...d, exercises: moveItem(d.exercises, idx, toIdx) };
      })
    );
  };

  // Move a day up or down (local only – saved when pressing Save)
  const moveDay = (dayId: string, direction: 'up' | 'down') => {
    setDays((prev) => {
      const idx = prev.findIndex((d) => d.id === dayId);
      const toIdx = direction === 'up' ? idx - 1 : idx + 1;
      const reordered = moveItem(prev, idx, toIdx);
      // Reassign day_numbers based on new order
      return reordered.map((d, i) => ({ ...d, day_number: i + 1 }));
    });
  };

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert(t('common.error'), t('programs.programNameRequired'));
    setSaving(true);

    const { error: progErr } = await updateProgram(id!, { title: title.trim(), description: description.trim(), difficulty });
    if (progErr) { setSaving(false); return Alert.alert(t('common.error'), progErr); }

    for (const day of days) {
      // Persist reordered day_number
      await supabase.from('program_days').update({ day_number: day.day_number }).eq('id', day.id);

      for (let i = 0; i < day.exercises.length; i++) {
        const ex = day.exercises[i];
        const data = {
          exercise_name: ex.exercise_name.trim(),
          sets: parseInt(ex.sets, 10) || 1,
          reps: ex.reps.trim() || '10',
          rest_time: ex.rest_time.trim(),
          notes: ex.notes.trim(),
          video_url: ex.video_url.trim(),
          order_index: i,
        };
        if (!data.exercise_name) continue;
        if (ex.id) {
          await updateExercise(ex.id, data);
        } else {
          const { id: newId } = await addExercise(day.id, data);
          if (newId) {
            setDays((prev) =>
              prev.map((d) =>
                d.id !== day.id ? d : {
                  ...d,
                  exercises: d.exercises.map((e) => e.key === ex.key ? { ...e, id: newId } : e),
                }
              )
            );
          }
        }
      }
    }

    setSaving(false);
    router.back();
  };

  if (isLoading || !currentProgram) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const difficulties: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('programs.editProgram')}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.textInverse} />
            : <Text style={styles.saveBtnText}>{t('common.save')}</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Metadata */}
        <Text style={styles.sectionLabel}>{t('programs.step1')}</Text>
        <View style={styles.section}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('programs.programName')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('programs.description')}</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('programs.difficulty')}</Text>
            <View style={styles.pillRow}>
              {difficulties.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.pill, difficulty === d && styles.pillActive]}
                  onPress={() => setDifficulty(d)}
                >
                  <Text style={[styles.pillText, difficulty === d && styles.pillTextActive]}>
                    {t(`programs.${d}` as any)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Days & exercises */}
        <Text style={styles.sectionLabel}>{t('programs.step2')}</Text>
        {days.map((day, dayIdx) => (
          <View key={day.id} style={styles.dayCard}>
            {/* Day header with reorder controls */}
            <View style={styles.dayHeader}>
              <View style={styles.dayReorderCol}>
                <TouchableOpacity
                  style={[styles.reorderBtn, dayIdx === 0 && styles.reorderBtnDisabled]}
                  onPress={() => moveDay(day.id, 'up')}
                  disabled={dayIdx === 0}
                >
                  <Text style={styles.reorderBtnText}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reorderBtn, dayIdx === days.length - 1 && styles.reorderBtnDisabled]}
                  onPress={() => moveDay(day.id, 'down')}
                  disabled={dayIdx === days.length - 1}
                >
                  <Text style={styles.reorderBtnText}>▼</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.dayHeaderContent}
                onPress={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
              >
                <Text style={styles.dayTitle}>{t('programs.day', { number: day.day_number })}</Text>
                <Text style={styles.dayMeta}>
                  {day.exercises.length} {t('programs.exercises')}  {expandedDay === day.id ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
            </View>

            {expandedDay === day.id && (
              <View style={styles.dayBody}>
                {day.exercises.length === 0 && (
                  <Text style={styles.noExText}>{t('programs.noExercises')}</Text>
                )}
                {day.exercises.map((ex, exIdx) => (
                  <View key={ex.key} style={styles.exerciseRow}>
                    {/* Drag handle column */}
                    <View style={styles.exReorderCol}>
                      <TouchableOpacity
                        style={[styles.reorderBtn, exIdx === 0 && styles.reorderBtnDisabled]}
                        onPress={() => moveExercise(day.id, ex.key, 'up')}
                        disabled={exIdx === 0}
                      >
                        <Text style={styles.reorderBtnText}>▲</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.reorderBtn, exIdx === day.exercises.length - 1 && styles.reorderBtnDisabled]}
                        onPress={() => moveExercise(day.id, ex.key, 'down')}
                        disabled={exIdx === day.exercises.length - 1}
                      >
                        <Text style={styles.reorderBtnText}>▼</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Exercise fields */}
                    <View style={styles.exFieldsCol}>
                      {/* Name + remove */}
                      <View style={styles.exerciseRowHeader}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder={t('programs.exerciseName')}
                          placeholderTextColor={colors.textMuted}
                          value={ex.exercise_name}
                          onChangeText={(v) => updateLocal(day.id, ex.key, 'exercise_name', v)}
                        />
                        <TouchableOpacity
                          onPress={() => removeLocal(day.id, ex.key, ex.id)}
                          style={styles.removeExBtn}
                        >
                          <Text style={styles.removeExText}>✕</Text>
                        </TouchableOpacity>
                      </View>

                      {/* YouTube URL */}
                      <TextInput
                        style={styles.input}
                        placeholder={t('programs.videoUrlPlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        value={ex.video_url}
                        onChangeText={(v) => updateLocal(day.id, ex.key, 'video_url', v)}
                        autoCapitalize="none"
                        keyboardType="url"
                      />

                      {/* Sets / Reps / Rest */}
                      <View style={styles.exerciseMiniRow}>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                          <Text style={styles.miniLabel}>{t('programs.sets')}</Text>
                          <TextInput
                            style={styles.inputMini}
                            keyboardType="number-pad"
                            value={ex.sets}
                            onChangeText={(v) => updateLocal(day.id, ex.key, 'sets', v)}
                            maxLength={2}
                          />
                        </View>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                          <Text style={styles.miniLabel}>{t('programs.reps')}</Text>
                          <TextInput
                            style={styles.inputMini}
                            value={ex.reps}
                            onChangeText={(v) => updateLocal(day.id, ex.key, 'reps', v)}
                          />
                        </View>
                        <View style={[styles.fieldGroup, { flex: 1 }]}>
                          <Text style={styles.miniLabel}>{t('programs.restTime')}</Text>
                          <TextInput
                            style={styles.inputMini}
                            value={ex.rest_time}
                            onChangeText={(v) => updateLocal(day.id, ex.key, 'rest_time', v)}
                          />
                        </View>
                      </View>

                      {/* Notes */}
                      <TextInput
                        style={[styles.input, { marginTop: spacing.xs }]}
                        placeholder={t('programs.notesPlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        value={ex.notes}
                        onChangeText={(v) => updateLocal(day.id, ex.key, 'notes', v)}
                      />
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.addExBtn} onPress={() => addLocal(day.id)}>
                  <Text style={styles.addExBtnText}>+ {t('programs.addExercise')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60, paddingBottom: spacing.lg, paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'center' },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    minWidth: 60, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textInverse },

  content: { padding: spacing['2xl'], paddingBottom: 100, gap: spacing.lg },
  section: { gap: spacing.md },
  sectionLabel: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  input: {
    backgroundColor: colors.card, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.md, color: colors.text,
  },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  pillTextActive: { color: colors.textInverse },

  // Day card
  dayCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, paddingRight: spacing.md,
  },
  dayReorderCol: {
    width: 36, alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingLeft: spacing.sm,
  },
  dayHeaderContent: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingLeft: spacing.sm,
  },
  dayTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  dayMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  dayBody: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, gap: spacing.md },
  noExText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // Exercise row
  exerciseRow: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.borderLight,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  exReorderCol: {
    width: 32, alignItems: 'center', justifyContent: 'center',
    gap: 2, paddingTop: spacing.sm, paddingBottom: spacing.sm, paddingLeft: spacing.xs,
  },
  exFieldsCol: { flex: 1, padding: spacing.sm, gap: spacing.xs },
  exerciseRowHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  exerciseMiniRow: { flexDirection: 'row', gap: spacing.sm },
  miniLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  inputMini: {
    backgroundColor: colors.card, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    fontSize: fontSize.sm, color: colors.text,
  },
  removeExBtn: { padding: spacing.xs },
  removeExText: { fontSize: fontSize.md, color: colors.textMuted },
  addExBtn: {
    borderWidth: 1, borderColor: colors.primaryLight, borderStyle: 'dashed',
    borderRadius: borderRadius.sm, padding: spacing.sm, alignItems: 'center',
  },
  addExBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primaryLight },

  // Reorder buttons (shared for days and exercises)
  reorderBtn: { padding: 3, borderRadius: 4 },
  reorderBtnDisabled: { opacity: 0.2 },
  reorderBtnText: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  reorderBtnTextDisabled: { color: colors.textMuted },
});
