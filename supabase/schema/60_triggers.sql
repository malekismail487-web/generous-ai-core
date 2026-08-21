-- Canonical Lumina schema source: triggers
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Name: bandit_arm_state bandit_arm_state_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bandit_arm_state_touch BEFORE UPDATE ON public.bandit_arm_state FOR EACH ROW EXECUTE FUNCTION public.touch_bandit_arm_state();


--

--
-- Name: lesson_events lesson_events_assign_seq_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lesson_events_assign_seq_trg BEFORE INSERT ON public.lesson_events FOR EACH ROW EXECUTE FUNCTION public.lesson_events_assign_seq();


--

--
-- Name: lesson_events lesson_events_broadcast_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lesson_events_broadcast_trg AFTER INSERT ON public.lesson_events FOR EACH ROW EXECUTE FUNCTION public.lesson_events_broadcast();


--

--
-- Name: lesson_sessions lesson_sessions_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lesson_sessions_touch_updated_at BEFORE UPDATE ON public.lesson_sessions FOR EACH ROW EXECUTE FUNCTION public.lse_touch_updated_at();


--

--
-- Name: assignment_submissions mi_after_assignment_submission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_assignment_submission AFTER INSERT ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION public.mi_tg_assignment_submission();


--

--
-- Name: chat_messages mi_after_chat_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_chat_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.mi_tg_chat_message();


--

--
-- Name: course_materials mi_after_course_material; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_course_material AFTER INSERT ON public.course_materials FOR EACH ROW EXECUTE FUNCTION public.mi_tg_course_material();


--

--
-- Name: exam_submissions mi_after_exam_submission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_exam_submission AFTER INSERT ON public.exam_submissions FOR EACH ROW EXECUTE FUNCTION public.mi_tg_exam_submission();


--

--
-- Name: lesson_events mi_after_lesson_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_lesson_event AFTER INSERT ON public.lesson_events FOR EACH ROW EXECUTE FUNCTION public.mi_tg_lesson_event();


--

--
-- Name: material_views mi_after_material_view; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_material_view AFTER INSERT ON public.material_views FOR EACH ROW EXECUTE FUNCTION public.mi_tg_material_view();


--

--
-- Name: saved_lectures mi_after_saved_lecture; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_saved_lecture AFTER INSERT ON public.saved_lectures FOR EACH ROW EXECUTE FUNCTION public.mi_tg_saved_lecture();


--

--
-- Name: subjects subjects_after_insert_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subjects_after_insert_sync AFTER INSERT ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.subjects_after_insert_sync();


--

--
-- Name: teacher_categories teacher_categories_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER teacher_categories_after_delete AFTER DELETE ON public.teacher_categories FOR EACH ROW EXECUTE FUNCTION public.tc_after_delete_sync();


--

--
-- Name: teacher_categories teacher_categories_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER teacher_categories_after_insert AFTER INSERT ON public.teacher_categories FOR EACH ROW EXECUTE FUNCTION public.tc_after_insert_sync();


--

--
-- Name: teacher_categories teacher_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER teacher_categories_updated_at BEFORE UPDATE ON public.teacher_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: tenants tenants_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenants_touch_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: ability_estimates trg_ability_estimates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ability_estimates_updated_at BEFORE UPDATE ON public.ability_estimates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: calibration_state trg_calibration_state_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_calibration_state_updated BEFORE UPDATE ON public.calibration_state FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: concept_mastery trg_concept_mastery_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_concept_mastery_updated BEFORE UPDATE ON public.concept_mastery FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: concepts trg_concepts_fill_parents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_concepts_fill_parents BEFORE INSERT ON public.concepts FOR EACH ROW EXECUTE FUNCTION public.concepts_fill_parents();


--

--
-- Name: concepts trg_concepts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_concepts_updated_at BEFORE UPDATE ON public.concepts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: curriculum_standards trg_curriculum_standards_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_curriculum_standards_touch BEFORE UPDATE ON public.curriculum_standards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: assignments trg_enforce_teacher_category_assignments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_teacher_category_assignments BEFORE INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_category();


--

--
-- Name: course_materials trg_enforce_teacher_category_materials; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_teacher_category_materials BEFORE INSERT ON public.course_materials FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_category();


--

--
-- Name: ensemble_weights trg_ens_w_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ens_w_updated BEFORE UPDATE ON public.ensemble_weights FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: profiles trg_generate_parent_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_parent_code AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.generate_parent_code_on_approval();


--

--
-- Name: kt_sequence_state trg_kt_seq_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kt_seq_updated BEFORE UPDATE ON public.kt_sequence_state FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: learning_mode_sessions trg_learning_mode_sessions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_learning_mode_sessions_updated BEFORE UPDATE ON public.learning_mode_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: lectures trg_lectures_fill_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lectures_fill_school BEFORE INSERT ON public.lectures FOR EACH ROW EXECUTE FUNCTION public.lectures_fill_school_id();


--

--
-- Name: lectures trg_lectures_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lectures_updated_at BEFORE UPDATE ON public.lectures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: live_meetings trg_live_meetings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_live_meetings_updated_at BEFORE UPDATE ON public.live_meetings FOR EACH ROW EXECUTE FUNCTION public.update_live_meetings_updated_at();


--

--
-- Name: mc_curriculum_subjects trg_mc_cs_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_cs_touch BEFORE UPDATE ON public.mc_curriculum_subjects FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: mc_curriculum_version_defs trg_mc_cvd_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_cvd_touch BEFORE UPDATE ON public.mc_curriculum_version_defs FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: mc_educational_policies trg_mc_ep_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_ep_touch BEFORE UPDATE ON public.mc_educational_policies FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: mc_lumina_config trg_mc_lc_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_lc_touch BEFORE UPDATE ON public.mc_lumina_config FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: mc_regions trg_mc_regions_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_regions_touch BEFORE UPDATE ON public.mc_regions FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: ministry_change_requests trg_mcr_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mcr_touch BEFORE UPDATE ON public.ministry_change_requests FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: ministry_announcements trg_ministry_announcements_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ministry_announcements_updated BEFORE UPDATE ON public.ministry_announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: ministry_role_assignments trg_mra_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mra_touch BEFORE UPDATE ON public.ministry_role_assignments FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: pilot_studies trg_pilot_studies_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pilot_studies_touch BEFORE UPDATE ON public.pilot_studies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: population_priors trg_population_priors_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_population_priors_touch BEFORE UPDATE ON public.population_priors FOR EACH ROW EXECUTE FUNCTION public.touch_population_priors_updated_at();


--

--
-- Name: question_bank trg_question_bank_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_question_bank_updated_at BEFORE UPDATE ON public.question_bank FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: student_answer_history trg_recalculate_difficulty_level; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recalculate_difficulty_level AFTER INSERT ON public.student_answer_history FOR EACH ROW EXECUTE FUNCTION public.recalculate_difficulty_level();


--

--
-- Name: cognitive_mirror_snapshots trg_recompute_mirror_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recompute_mirror_stats AFTER INSERT OR UPDATE OF prediction_matched, drift_score ON public.cognitive_mirror_snapshots FOR EACH ROW EXECUTE FUNCTION public.recompute_mirror_stats();


--

--
-- Name: confidence_responses trg_refresh_confidence_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_refresh_confidence_stats AFTER INSERT ON public.confidence_responses FOR EACH ROW EXECUTE FUNCTION public.refresh_confidence_stats();


--

--
-- Name: notes trg_snapshot_note_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_snapshot_note_insert AFTER INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION public.snapshot_note_on_save();


--

--
-- Name: notes trg_snapshot_note_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_snapshot_note_update AFTER UPDATE ON public.notes FOR EACH ROW WHEN (((old.content IS DISTINCT FROM new.content) OR (old.title IS DISTINCT FROM new.title))) EXECUTE FUNCTION public.snapshot_note_on_save();


--

--
-- Name: subjects trg_subjects_sync_on_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subjects_sync_on_delete BEFORE DELETE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.subjects_sync_on_delete();


--

--
-- Name: teacher_overrides trg_teacher_overrides_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_teacher_overrides_touch BEFORE UPDATE ON public.teacher_overrides FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: tenant_feature_flags trg_tenant_feature_flags_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_feature_flags_updated BEFORE UPDATE ON public.tenant_feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: topic_locks trg_topic_locks_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_topic_locks_touch BEFORE UPDATE ON public.topic_locks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: student_answer_history trigger_recalculate_difficulty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_recalculate_difficulty AFTER INSERT ON public.student_answer_history FOR EACH ROW EXECUTE FUNCTION public.recalculate_difficulty_level();


--

--
-- Name: conversations update_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: course_materials update_course_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_course_materials_updated_at BEFORE UPDATE ON public.course_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: daily_streaks update_daily_streaks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_daily_streaks_updated_at BEFORE UPDATE ON public.daily_streaks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: materials update_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: notes update_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: saved_lectures update_saved_lectures_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_saved_lectures_updated_at BEFORE UPDATE ON public.saved_lectures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: schools update_schools_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: student_goals update_student_goals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_student_goals_updated_at BEFORE UPDATE ON public.student_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: teacher_requests update_teacher_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_teacher_requests_updated_at BEFORE UPDATE ON public.teacher_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: weekly_plans update_weekly_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_weekly_plans_updated_at BEFORE UPDATE ON public.weekly_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
