-- Canonical Lumina schema source: constraints and indexes
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Name: ability_estimates ability_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ability_estimates
    ADD CONSTRAINT ability_estimates_pkey PRIMARY KEY (id);


--

--
-- Name: ability_estimates ability_estimates_user_id_subject_concept_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ability_estimates
    ADD CONSTRAINT ability_estimates_user_id_subject_concept_id_key UNIQUE (user_id, subject, concept_id);


--

--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--

--
-- Name: adaptive_quality_scores adaptive_quality_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adaptive_quality_scores
    ADD CONSTRAINT adaptive_quality_scores_pkey PRIMARY KEY (id);


--

--
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--

--
-- Name: ai_output_signals ai_output_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_output_signals
    ADD CONSTRAINT ai_output_signals_pkey PRIMARY KEY (id);


--

--
-- Name: ale_api_students ale_api_students_api_key_id_external_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ale_api_students
    ADD CONSTRAINT ale_api_students_api_key_id_external_ref_key UNIQUE (api_key_id, external_ref);


--

--
-- Name: ale_api_students ale_api_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ale_api_students
    ADD CONSTRAINT ale_api_students_pkey PRIMARY KEY (id);


--

--
-- Name: ale_api_usage ale_api_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ale_api_usage
    ADD CONSTRAINT ale_api_usage_pkey PRIMARY KEY (id);


--

--
-- Name: anchor_recalibrations anchor_recalibrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anchor_recalibrations
    ADD CONSTRAINT anchor_recalibrations_pkey PRIMARY KEY (id);


--

--
-- Name: announcement_reads announcement_reads_announcement_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_user_id_key UNIQUE (announcement_id, user_id);


--

--
-- Name: announcement_reads announcement_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (id);


--

--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--

--
-- Name: assessment_scores assessment_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_scores
    ADD CONSTRAINT assessment_scores_pkey PRIMARY KEY (id);


--

--
-- Name: assignment_submissions assignment_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_pkey PRIMARY KEY (id);


--

--
-- Name: assignment_views assignment_views_assignment_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_views
    ADD CONSTRAINT assignment_views_assignment_id_user_id_key UNIQUE (assignment_id, user_id);


--

--
-- Name: assignment_views assignment_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_views
    ADD CONSTRAINT assignment_views_pkey PRIMARY KEY (id);


--

--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--

--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--

--
-- Name: attendance attendance_student_id_class_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_class_id_date_key UNIQUE (student_id, class_id, date);


--

--
-- Name: awards awards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_pkey PRIMARY KEY (id);


--

--
-- Name: bandit_arm_state bandit_arm_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandit_arm_state
    ADD CONSTRAINT bandit_arm_state_pkey PRIMARY KEY (id);


--

--
-- Name: bandit_decisions bandit_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandit_decisions
    ADD CONSTRAINT bandit_decisions_pkey PRIMARY KEY (id);


--

--
-- Name: calibration_state calibration_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_state
    ADD CONSTRAINT calibration_state_pkey PRIMARY KEY (id);


--

--
-- Name: calibration_state calibration_state_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_state
    ADD CONSTRAINT calibration_state_subject_key UNIQUE (subject);


--

--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--

--
-- Name: chat_rooms chat_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_pkey PRIMARY KEY (id);


--

--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--

--
-- Name: cognitive_mirror_snapshots cognitive_mirror_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cognitive_mirror_snapshots
    ADD CONSTRAINT cognitive_mirror_snapshots_pkey PRIMARY KEY (id);


--

--
-- Name: cognitive_mirror_stats cognitive_mirror_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cognitive_mirror_stats
    ADD CONSTRAINT cognitive_mirror_stats_pkey PRIMARY KEY (user_id);


--

--
-- Name: concept_mastery concept_mastery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_pkey PRIMARY KEY (id);


--

--
-- Name: concept_mastery concept_mastery_user_id_subject_topic_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_user_id_subject_topic_key UNIQUE (user_id, subject, topic);


--

--
-- Name: concept_standard_map concept_standard_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_pkey PRIMARY KEY (id);


--

--
-- Name: concept_standard_map concept_standard_map_school_id_subject_concept_key_standard_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_school_id_subject_concept_key_standard_key UNIQUE (school_id, subject, concept_key, standard_id, objective_id);


--

--
-- Name: concepts concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_pkey PRIMARY KEY (id);


--

--
-- Name: confidence_calibration_stats confidence_calibration_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confidence_calibration_stats
    ADD CONSTRAINT confidence_calibration_stats_pkey PRIMARY KEY (id);


--

--
-- Name: confidence_calibration_stats confidence_calibration_stats_user_id_subject_topic_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confidence_calibration_stats
    ADD CONSTRAINT confidence_calibration_stats_user_id_subject_topic_key UNIQUE (user_id, subject, topic);


--

--
-- Name: confidence_responses confidence_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confidence_responses
    ADD CONSTRAINT confidence_responses_pkey PRIMARY KEY (id);


--

--
-- Name: content_flags content_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_pkey PRIMARY KEY (id);


--

--
-- Name: continuous_validation_runs continuous_validation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuous_validation_runs
    ADD CONSTRAINT continuous_validation_runs_pkey PRIMARY KEY (id);


--

--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--

--
-- Name: course_materials course_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_pkey PRIMARY KEY (id);


--

--
-- Name: curriculum_standards curriculum_standards_framework_code_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_framework_code_school_id_key UNIQUE (framework, code, school_id);


--

--
-- Name: curriculum_standards curriculum_standards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_pkey PRIMARY KEY (id);


--

--
-- Name: curriculum_versions curriculum_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_versions
    ADD CONSTRAINT curriculum_versions_pkey PRIMARY KEY (id);


--

--
-- Name: daily_streaks daily_streaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_streaks
    ADD CONSTRAINT daily_streaks_pkey PRIMARY KEY (id);


--

--
-- Name: daily_streaks daily_streaks_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_streaks
    ADD CONSTRAINT daily_streaks_user_id_key UNIQUE (user_id);


--

--
-- Name: data_export_requests data_export_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_export_requests
    ADD CONSTRAINT data_export_requests_pkey PRIMARY KEY (id);


--

--
-- Name: decay_refreshers decay_refreshers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decay_refreshers
    ADD CONSTRAINT decay_refreshers_pkey PRIMARY KEY (id);


--

--
-- Name: engine_drift_alerts engine_drift_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_drift_alerts
    ADD CONSTRAINT engine_drift_alerts_pkey PRIMARY KEY (id);


--

--
-- Name: ensemble_fit_runs ensemble_fit_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_fit_runs
    ADD CONSTRAINT ensemble_fit_runs_pkey PRIMARY KEY (id);


--

--
-- Name: ensemble_predictions ensemble_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_predictions
    ADD CONSTRAINT ensemble_predictions_pkey PRIMARY KEY (id);


--

--
-- Name: ensemble_weights ensemble_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_weights
    ADD CONSTRAINT ensemble_weights_pkey PRIMARY KEY (id);


--

--
-- Name: exam_submissions exam_submissions_exam_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_exam_id_student_id_key UNIQUE (exam_id, student_id);


--

--
-- Name: exam_submissions exam_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_pkey PRIMARY KEY (id);


--

--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--

--
-- Name: extension_audit_chats extension_audit_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_audit_chats
    ADD CONSTRAINT extension_audit_chats_pkey PRIMARY KEY (id);


--

--
-- Name: extension_blueprints extension_blueprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_blueprints
    ADD CONSTRAINT extension_blueprints_pkey PRIMARY KEY (id);


--

--
-- Name: extension_conversations extension_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_conversations
    ADD CONSTRAINT extension_conversations_pkey PRIMARY KEY (id);


--

--
-- Name: extension_data extension_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_data
    ADD CONSTRAINT extension_data_pkey PRIMARY KEY (id);


--

--
-- Name: extension_messages extension_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_messages
    ADD CONSTRAINT extension_messages_pkey PRIMARY KEY (id);


--

--
-- Name: extension_requests extension_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_pkey PRIMARY KEY (id);


--

--
-- Name: extension_sandbox_data extension_sandbox_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_sandbox_data
    ADD CONSTRAINT extension_sandbox_data_pkey PRIMARY KEY (id);


--

--
-- Name: extension_versions extension_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_pkey PRIMARY KEY (id);


--

--
-- Name: fsrs_card_state fsrs_card_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fsrs_card_state
    ADD CONSTRAINT fsrs_card_state_pkey PRIMARY KEY (id);


--

--
-- Name: governance_audit_trail governance_audit_trail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_audit_trail
    ADD CONSTRAINT governance_audit_trail_pkey PRIMARY KEY (id);


--

--
-- Name: graded_events graded_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graded_events
    ADD CONSTRAINT graded_events_pkey PRIMARY KEY (id);


--

--
-- Name: hyperparameter_settings hyperparameter_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hyperparameter_settings
    ADD CONSTRAINT hyperparameter_settings_pkey PRIMARY KEY (id);


--

--
-- Name: hyperparameter_tuning_runs hyperparameter_tuning_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hyperparameter_tuning_runs
    ADD CONSTRAINT hyperparameter_tuning_runs_pkey PRIMARY KEY (id);


--

--
-- Name: invite_codes invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (id);


--

--
-- Name: invite_codes invite_codes_school_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_school_id_code_key UNIQUE (school_id, code);


--

--
-- Name: invite_requests invite_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_requests
    ADD CONSTRAINT invite_requests_pkey PRIMARY KEY (id);


--

--
-- Name: iq_test_results iq_test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iq_test_results
    ADD CONSTRAINT iq_test_results_pkey PRIMARY KEY (id);


--

--
-- Name: item_parameter_history item_parameter_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_parameter_history
    ADD CONSTRAINT item_parameter_history_pkey PRIMARY KEY (id);


--

--
-- Name: knowledge_gaps knowledge_gaps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_gaps
    ADD CONSTRAINT knowledge_gaps_pkey PRIMARY KEY (id);


--

--
-- Name: kt_sequence_state kt_sequence_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kt_sequence_state
    ADD CONSTRAINT kt_sequence_state_pkey PRIMARY KEY (id);


--

--
-- Name: kt_sequence_state kt_sequence_state_user_id_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kt_sequence_state
    ADD CONSTRAINT kt_sequence_state_user_id_subject_key UNIQUE (user_id, subject);


--

--
-- Name: lct_exam_locks lct_exam_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_locks
    ADD CONSTRAINT lct_exam_locks_pkey PRIMARY KEY (id);


--

--
-- Name: lct_exam_locks lct_exam_locks_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_locks
    ADD CONSTRAINT lct_exam_locks_student_id_key UNIQUE (student_id);


--

--
-- Name: lct_exam_schools lct_exam_schools_exam_id_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_schools
    ADD CONSTRAINT lct_exam_schools_exam_id_school_id_key UNIQUE (exam_id, school_id);


--

--
-- Name: lct_exam_schools lct_exam_schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_schools
    ADD CONSTRAINT lct_exam_schools_pkey PRIMARY KEY (id);


--

--
-- Name: lct_exam_students lct_exam_students_exam_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_exam_id_student_id_key UNIQUE (exam_id, student_id);


--

--
-- Name: lct_exam_students lct_exam_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_pkey PRIMARY KEY (id);


--

--
-- Name: lct_exams lct_exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exams
    ADD CONSTRAINT lct_exams_pkey PRIMARY KEY (id);


--

--
-- Name: learning_mode_sessions learning_mode_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_mode_sessions
    ADD CONSTRAINT learning_mode_sessions_pkey PRIMARY KEY (id);


--

--
-- Name: learning_objectives learning_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_pkey PRIMARY KEY (id);


--

--
-- Name: learning_objectives learning_objectives_standard_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_standard_id_code_key UNIQUE (standard_id, code);


--

--
-- Name: learning_outcomes learning_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_outcomes
    ADD CONSTRAINT learning_outcomes_pkey PRIMARY KEY (id);


--

--
-- Name: learning_style_profiles learning_style_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_style_profiles
    ADD CONSTRAINT learning_style_profiles_pkey PRIMARY KEY (id);


--

--
-- Name: learning_style_profiles learning_style_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_style_profiles
    ADD CONSTRAINT learning_style_profiles_user_id_key UNIQUE (user_id);


--

--
-- Name: lectures lectures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lectures
    ADD CONSTRAINT lectures_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_events lesson_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_events
    ADD CONSTRAINT lesson_events_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_explanations lesson_explanations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_explanations
    ADD CONSTRAINT lesson_explanations_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_objective_bindings lesson_objective_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_objective_bindings
    ADD CONSTRAINT lesson_objective_bindings_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_plans lesson_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_sessions lesson_sessions_lesson_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_sessions
    ADD CONSTRAINT lesson_sessions_lesson_id_student_id_key UNIQUE (lesson_id, student_id);


--

--
-- Name: lesson_sessions lesson_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_sessions
    ADD CONSTRAINT lesson_sessions_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_state_snapshots lesson_state_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_state_snapshots
    ADD CONSTRAINT lesson_state_snapshots_pkey PRIMARY KEY (id);


--

--
-- Name: live_meetings live_meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_meetings
    ADD CONSTRAINT live_meetings_pkey PRIMARY KEY (id);


--

--
-- Name: live_meetings live_meetings_share_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_meetings
    ADD CONSTRAINT live_meetings_share_code_key UNIQUE (share_code);


--

--
-- Name: lumina_api_usage lumina_api_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lumina_api_usage
    ADD CONSTRAINT lumina_api_usage_pkey PRIMARY KEY (id);


--

--
-- Name: lumina_cost_ledger lumina_cost_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lumina_cost_ledger
    ADD CONSTRAINT lumina_cost_ledger_pkey PRIMARY KEY (id);


--

--
-- Name: lumina_cost_ledger lumina_cost_ledger_user_id_feature_usage_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lumina_cost_ledger
    ADD CONSTRAINT lumina_cost_ledger_user_id_feature_usage_date_key UNIQUE (user_id, feature, usage_date);


--

--
-- Name: material_comments material_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_comments
    ADD CONSTRAINT material_comments_pkey PRIMARY KEY (id);


--

--
-- Name: material_views material_views_material_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_views
    ADD CONSTRAINT material_views_material_id_user_id_key UNIQUE (material_id, user_id);


--

--
-- Name: material_views material_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_views
    ADD CONSTRAINT material_views_pkey PRIMARY KEY (id);


--

--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--

--
-- Name: mc_curriculum_subjects mc_curriculum_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_subjects
    ADD CONSTRAINT mc_curriculum_subjects_pkey PRIMARY KEY (id);


--

--
-- Name: mc_curriculum_subjects mc_curriculum_subjects_tenant_id_subject_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_subjects
    ADD CONSTRAINT mc_curriculum_subjects_tenant_id_subject_code_key UNIQUE (tenant_id, subject_code);


--

--
-- Name: mc_curriculum_version_defs mc_curriculum_version_defs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_version_defs
    ADD CONSTRAINT mc_curriculum_version_defs_pkey PRIMARY KEY (id);


--

--
-- Name: mc_curriculum_version_defs mc_curriculum_version_defs_tenant_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_version_defs
    ADD CONSTRAINT mc_curriculum_version_defs_tenant_id_label_key UNIQUE (tenant_id, label);


--

--
-- Name: mc_educational_policies mc_educational_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_educational_policies
    ADD CONSTRAINT mc_educational_policies_pkey PRIMARY KEY (id);


--

--
-- Name: mc_educational_policies mc_educational_policies_tenant_id_policy_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_educational_policies
    ADD CONSTRAINT mc_educational_policies_tenant_id_policy_key_key UNIQUE (tenant_id, policy_key);


--

--
-- Name: mc_lumina_config mc_lumina_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_lumina_config
    ADD CONSTRAINT mc_lumina_config_pkey PRIMARY KEY (id);


--

--
-- Name: mc_lumina_config mc_lumina_config_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_lumina_config
    ADD CONSTRAINT mc_lumina_config_tenant_id_key UNIQUE (tenant_id);


--

--
-- Name: mc_regions mc_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_regions
    ADD CONSTRAINT mc_regions_pkey PRIMARY KEY (id);


--

--
-- Name: mc_regions mc_regions_tenant_id_name_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_regions
    ADD CONSTRAINT mc_regions_tenant_id_name_kind_key UNIQUE (tenant_id, name, kind);


--

--
-- Name: mc_school_lifecycle_events mc_school_lifecycle_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_lifecycle_events
    ADD CONSTRAINT mc_school_lifecycle_events_pkey PRIMARY KEY (id);


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_pkey PRIMARY KEY (id);


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_school_id_region_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_school_id_region_id_key UNIQUE (school_id, region_id);


--

--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--

--
-- Name: mi_daily_rollups mi_daily_rollups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_pkey PRIMARY KEY (id);


--

--
-- Name: mi_educational_events mi_educational_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_pkey PRIMARY KEY (id);


--

--
-- Name: mi_insights mi_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_pkey PRIMARY KEY (id);


--

--
-- Name: mind_map_history mind_map_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_map_history
    ADD CONSTRAINT mind_map_history_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_access_codes ministry_access_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_codes
    ADD CONSTRAINT ministry_access_codes_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_access_requests ministry_access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_requests
    ADD CONSTRAINT ministry_access_requests_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_access_requests ministry_access_requests_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_requests
    ADD CONSTRAINT ministry_access_requests_session_token_key UNIQUE (session_token);


--

--
-- Name: ministry_announcements ministry_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_announcements
    ADD CONSTRAINT ministry_announcements_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_audit_log ministry_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_audit_log
    ADD CONSTRAINT ministry_audit_log_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_capabilities ministry_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_capabilities
    ADD CONSTRAINT ministry_capabilities_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_capabilities ministry_capabilities_role_capability_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_capabilities
    ADD CONSTRAINT ministry_capabilities_role_capability_key UNIQUE (role, capability);


--

--
-- Name: ministry_change_appliers ministry_change_appliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_change_appliers
    ADD CONSTRAINT ministry_change_appliers_pkey PRIMARY KEY (entity_type);


--

--
-- Name: ministry_change_requests ministry_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_change_requests
    ADD CONSTRAINT ministry_change_requests_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_ip_bans ministry_ip_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_ip_bans
    ADD CONSTRAINT ministry_ip_bans_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_role_assignments ministry_role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_role_assignments
    ADD CONSTRAINT ministry_role_assignments_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_role_assignments ministry_role_assignments_tenant_id_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_role_assignments
    ADD CONSTRAINT ministry_role_assignments_tenant_id_user_id_role_key UNIQUE (tenant_id, user_id, role);


--

--
-- Name: ministry_sessions ministry_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_sessions
    ADD CONSTRAINT ministry_sessions_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_sessions ministry_sessions_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_sessions
    ADD CONSTRAINT ministry_sessions_session_token_key UNIQUE (session_token);


--

--
-- Name: misconception_embeddings misconception_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception_embeddings
    ADD CONSTRAINT misconception_embeddings_pkey PRIMARY KEY (id);


--

--
-- Name: misconception_embeddings misconception_embeddings_user_id_concept_id_misconception_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception_embeddings
    ADD CONSTRAINT misconception_embeddings_user_id_concept_id_misconception_i_key UNIQUE (user_id, concept_id, misconception_id);


--

--
-- Name: model_evaluation_metrics model_evaluation_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_evaluation_metrics
    ADD CONSTRAINT model_evaluation_metrics_pkey PRIMARY KEY (id);


--

--
-- Name: model_evaluation_runs model_evaluation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_evaluation_runs
    ADD CONSTRAINT model_evaluation_runs_pkey PRIMARY KEY (id);


--

--
-- Name: moderation_actions moderation_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_pkey PRIMARY KEY (id);


--

--
-- Name: moderator_invite_codes moderator_invite_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_invite_codes
    ADD CONSTRAINT moderator_invite_codes_code_key UNIQUE (code);


--

--
-- Name: moderator_invite_codes moderator_invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_invite_codes
    ADD CONSTRAINT moderator_invite_codes_pkey PRIMARY KEY (id);


--

--
-- Name: moderator_requests moderator_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_requests
    ADD CONSTRAINT moderator_requests_pkey PRIMARY KEY (id);


--

--
-- Name: morning_briefings morning_briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.morning_briefings
    ADD CONSTRAINT morning_briefings_pkey PRIMARY KEY (id);


--

--
-- Name: morning_briefings morning_briefings_user_id_scheduled_for_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.morning_briefings
    ADD CONSTRAINT morning_briefings_user_id_scheduled_for_key UNIQUE (user_id, scheduled_for);


--

--
-- Name: note_snapshots note_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_snapshots
    ADD CONSTRAINT note_snapshots_pkey PRIMARY KEY (id);


--

--
-- Name: note_timeline_summaries note_timeline_summaries_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_timeline_summaries
    ADD CONSTRAINT note_timeline_summaries_note_id_key UNIQUE (note_id);


--

--
-- Name: note_timeline_summaries note_timeline_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_timeline_summaries
    ADD CONSTRAINT note_timeline_summaries_pkey PRIMARY KEY (id);


--

--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--

--
-- Name: parent_invite_codes parent_invite_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_invite_codes
    ADD CONSTRAINT parent_invite_codes_code_key UNIQUE (code);


--

--
-- Name: parent_invite_codes parent_invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_invite_codes
    ADD CONSTRAINT parent_invite_codes_pkey PRIMARY KEY (id);


--

--
-- Name: parent_students parent_students_parent_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_students
    ADD CONSTRAINT parent_students_parent_id_student_id_key UNIQUE (parent_id, student_id);


--

--
-- Name: parent_students parent_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_students
    ADD CONSTRAINT parent_students_pkey PRIMARY KEY (id);


--

--
-- Name: pilot_assignments pilot_assignments_pilot_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_assignments
    ADD CONSTRAINT pilot_assignments_pilot_id_student_id_key UNIQUE (pilot_id, student_id);


--

--
-- Name: pilot_assignments pilot_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_assignments
    ADD CONSTRAINT pilot_assignments_pkey PRIMARY KEY (id);


--

--
-- Name: pilot_studies pilot_studies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_studies
    ADD CONSTRAINT pilot_studies_pkey PRIMARY KEY (id);


--

--
-- Name: podcast_generations podcast_generations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.podcast_generations
    ADD CONSTRAINT podcast_generations_pkey PRIMARY KEY (id);


--

--
-- Name: policy_evaluation_results policy_evaluation_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_evaluation_results
    ADD CONSTRAINT policy_evaluation_results_pkey PRIMARY KEY (id);


--

--
-- Name: policy_evaluation_runs policy_evaluation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_evaluation_runs
    ADD CONSTRAINT policy_evaluation_runs_pkey PRIMARY KEY (id);


--

--
-- Name: policy_regret_log policy_regret_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_regret_log
    ADD CONSTRAINT policy_regret_log_pkey PRIMARY KEY (id);


--

--
-- Name: population_prior_runs population_prior_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_prior_runs
    ADD CONSTRAINT population_prior_runs_pkey PRIMARY KEY (id);


--

--
-- Name: population_priors population_priors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_priors
    ADD CONSTRAINT population_priors_pkey PRIMARY KEY (id);


--

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--

--
-- Name: question_bank question_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_bank
    ADD CONSTRAINT question_bank_pkey PRIMARY KEY (id);


--

--
-- Name: question_bank question_bank_question_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_bank
    ADD CONSTRAINT question_bank_question_hash_key UNIQUE (question_hash);


--

--
-- Name: recall_schedule recall_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_schedule
    ADD CONSTRAINT recall_schedule_pkey PRIMARY KEY (id);


--

--
-- Name: report_cards report_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_pkey PRIMARY KEY (id);


--

--
-- Name: saved_lectures saved_lectures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_lectures
    ADD CONSTRAINT saved_lectures_pkey PRIMARY KEY (id);


--

--
-- Name: school_admins school_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_pkey PRIMARY KEY (id);


--

--
-- Name: school_admins school_admins_user_id_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_user_id_school_id_key UNIQUE (user_id, school_id);


--

--
-- Name: schools schools_activation_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_activation_code_hash_key UNIQUE (activation_code_hash);


--

--
-- Name: schools schools_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_code_key UNIQUE (code);


--

--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--

--
-- Name: student_answer_history student_answer_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_answer_history
    ADD CONSTRAINT student_answer_history_pkey PRIMARY KEY (id);


--

--
-- Name: student_classes student_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_pkey PRIMARY KEY (id);


--

--
-- Name: student_classes student_classes_student_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_student_id_class_id_key UNIQUE (student_id, class_id);


--

--
-- Name: student_goals student_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_goals
    ADD CONSTRAINT student_goals_pkey PRIMARY KEY (id);


--

--
-- Name: student_learning_profiles student_learning_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_learning_profiles
    ADD CONSTRAINT student_learning_profiles_pkey PRIMARY KEY (id);


--

--
-- Name: student_learning_profiles student_learning_profiles_user_id_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_learning_profiles
    ADD CONSTRAINT student_learning_profiles_user_id_subject_key UNIQUE (user_id, subject);


--

--
-- Name: student_memory student_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_memory
    ADD CONSTRAINT student_memory_pkey PRIMARY KEY (id);


--

--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--

--
-- Name: submissions submissions_assignment_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_student_id_key UNIQUE (assignment_id, student_id);


--

--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--

--
-- Name: symbolic_alignment_matrices symbolic_alignment_matrices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symbolic_alignment_matrices
    ADD CONSTRAINT symbolic_alignment_matrices_pkey PRIMARY KEY (id);


--

--
-- Name: symbolic_alignment_matrices symbolic_alignment_matrices_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symbolic_alignment_matrices
    ADD CONSTRAINT symbolic_alignment_matrices_version_key UNIQUE (version);


--

--
-- Name: teacher_categories teacher_categories_permanent_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_categories
    ADD CONSTRAINT teacher_categories_permanent_invite_code_key UNIQUE (permanent_invite_code);


--

--
-- Name: teacher_categories teacher_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_categories
    ADD CONSTRAINT teacher_categories_pkey PRIMARY KEY (id);


--

--
-- Name: teacher_overrides teacher_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_overrides
    ADD CONSTRAINT teacher_overrides_pkey PRIMARY KEY (id);


--

--
-- Name: teacher_requests teacher_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_requests
    ADD CONSTRAINT teacher_requests_pkey PRIMARY KEY (id);


--

--
-- Name: teacher_requests teacher_requests_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_requests
    ADD CONSTRAINT teacher_requests_user_id_key UNIQUE (user_id);


--

--
-- Name: teacher_subjects teacher_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_pkey PRIMARY KEY (id);


--

--
-- Name: teacher_subjects teacher_subjects_teacher_id_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_teacher_id_subject_id_key UNIQUE (teacher_id, subject_id);


--

--
-- Name: tenant_feature_flags tenant_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_pkey PRIMARY KEY (id);


--

--
-- Name: tenant_feature_flags tenant_feature_flags_tenant_id_flag_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_tenant_id_flag_key_key UNIQUE (tenant_id, flag_key);


--

--
-- Name: tenant_roles tenant_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT tenant_roles_pkey PRIMARY KEY (id);


--

--
-- Name: tenant_roles tenant_roles_user_id_tenant_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT tenant_roles_user_id_tenant_id_role_key UNIQUE (user_id, tenant_id, role);


--

--
-- Name: tenants tenants_country_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_country_code_key UNIQUE (country_code);


--

--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--

--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--

--
-- Name: topic_locks topic_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_locks
    ADD CONSTRAINT topic_locks_pkey PRIMARY KEY (id);


--

--
-- Name: trip_reads trip_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_reads
    ADD CONSTRAINT trip_reads_pkey PRIMARY KEY (id);


--

--
-- Name: trip_reads trip_reads_trip_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_reads
    ADD CONSTRAINT trip_reads_trip_id_user_id_key UNIQUE (trip_id, user_id);


--

--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);


--

--
-- Name: unified_objective_runs unified_objective_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_objective_runs
    ADD CONSTRAINT unified_objective_runs_pkey PRIMARY KEY (id);


--

--
-- Name: unified_policy_decisions unified_policy_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_decisions
    ADD CONSTRAINT unified_policy_decisions_pkey PRIMARY KEY (id);


--

--
-- Name: unified_policy_weights unified_policy_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_weights
    ADD CONSTRAINT unified_policy_weights_pkey PRIMARY KEY (id);


--

--
-- Name: unified_policy_weights unified_policy_weights_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_weights
    ADD CONSTRAINT unified_policy_weights_version_key UNIQUE (version);


--

--
-- Name: unified_student_state unified_student_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_student_state
    ADD CONSTRAINT unified_student_state_pkey PRIMARY KEY (id);


--

--
-- Name: user_activity_log user_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log
    ADD CONSTRAINT user_activity_log_pkey PRIMARY KEY (id);


--

--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--

--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--

--
-- Name: user_strikes user_strikes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strikes
    ADD CONSTRAINT user_strikes_pkey PRIMARY KEY (id);


--

--
-- Name: weekly_plans weekly_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT weekly_plans_pkey PRIMARY KEY (id);


--

--
-- Name: ale_api_usage_key_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ale_api_usage_key_created_idx ON public.ale_api_usage USING btree (api_key_id, created_at DESC);


--

--
-- Name: bandit_arm_state_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_arm_state_lookup_idx ON public.bandit_arm_state USING btree (subject, arm_id, scope);


--

--
-- Name: bandit_arm_state_pop_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bandit_arm_state_pop_uq ON public.bandit_arm_state USING btree (subject, arm_id) WHERE (scope = 'population'::text);


--

--
-- Name: bandit_arm_state_user_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bandit_arm_state_user_uq ON public.bandit_arm_state USING btree (user_id, subject, arm_id) WHERE (scope = 'user'::text);


--

--
-- Name: bandit_decisions_arm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_decisions_arm_idx ON public.bandit_decisions USING btree (subject, arm_id, created_at DESC);


--

--
-- Name: bandit_decisions_pending_reward_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_decisions_pending_reward_idx ON public.bandit_decisions USING btree (user_id, subject, concept_id) WHERE (rewarded = false);


--

--
-- Name: bandit_decisions_propensity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_decisions_propensity_idx ON public.bandit_decisions USING btree (subject, created_at DESC) WHERE (behaviour_prob IS NOT NULL);


--

--
-- Name: bandit_decisions_user_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_decisions_user_subject_idx ON public.bandit_decisions USING btree (user_id, subject, created_at DESC);


--

--
-- Name: continuous_validation_runs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX continuous_validation_runs_created_idx ON public.continuous_validation_runs USING btree (created_at DESC);


--

--
-- Name: engine_drift_alerts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engine_drift_alerts_created_idx ON public.engine_drift_alerts USING btree (created_at DESC);


--

--
-- Name: ensemble_fit_runs_pop_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_fit_runs_pop_idx ON public.ensemble_fit_runs USING btree (subject, created_at DESC) WHERE (scope = 'population'::text);


--

--
-- Name: ensemble_fit_runs_user_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_fit_runs_user_subject_idx ON public.ensemble_fit_runs USING btree (user_id, subject, created_at DESC);


--

--
-- Name: ensemble_predictions_pending_outcome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_predictions_pending_outcome_idx ON public.ensemble_predictions USING btree (user_id, subject, concept_id) WHERE (outcome IS NULL);


--

--
-- Name: ensemble_predictions_subject_labeled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_predictions_subject_labeled_idx ON public.ensemble_predictions USING btree (subject, outcome_attached_at DESC) WHERE (outcome IS NOT NULL);


--

--
-- Name: ensemble_predictions_user_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_predictions_user_subject_idx ON public.ensemble_predictions USING btree (user_id, subject, created_at DESC);


--

--
-- Name: fsrs_card_state_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fsrs_card_state_due ON public.fsrs_card_state USING btree (user_id, next_review_at);


--

--
-- Name: fsrs_card_state_leech; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fsrs_card_state_leech ON public.fsrs_card_state USING btree (user_id) WHERE (is_leech = true);


--

--
-- Name: fsrs_card_state_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fsrs_card_state_priority ON public.fsrs_card_state USING btree (user_id, priority DESC);


--

--
-- Name: fsrs_card_state_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fsrs_card_state_unique ON public.fsrs_card_state USING btree (user_id, subject, COALESCE(concept_id, '00000000-0000-0000-0000-000000000000'::uuid));


--

--
-- Name: hyperparameter_settings_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hyperparameter_settings_active_unique ON public.hyperparameter_settings USING btree (scope) WHERE (active = true);


--

--
-- Name: idx_ability_user_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ability_user_concept ON public.ability_estimates USING btree (user_id, concept_id);


--

--
-- Name: idx_ability_user_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ability_user_subject ON public.ability_estimates USING btree (user_id, subject);


--

--
-- Name: idx_anchor_recalibrations_subject_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anchor_recalibrations_subject_time ON public.anchor_recalibrations USING btree (subject, created_at DESC);


--

--
-- Name: idx_aos_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aos_feature ON public.ai_output_signals USING btree (feature);


--

--
-- Name: idx_aos_output_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aos_output_hash ON public.ai_output_signals USING btree (output_hash);


--

--
-- Name: idx_aos_school_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aos_school_created ON public.ai_output_signals USING btree (school_id, created_at DESC);


--

--
-- Name: idx_aos_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aos_user_created ON public.ai_output_signals USING btree (user_id, created_at DESC);


--

--
-- Name: idx_aqs_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aqs_feature ON public.adaptive_quality_scores USING btree (feature);


--

--
-- Name: idx_aqs_school_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aqs_school_created ON public.adaptive_quality_scores USING btree (school_id, created_at DESC);


--

--
-- Name: idx_aqs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aqs_user_created ON public.adaptive_quality_scores USING btree (user_id, created_at DESC);


--

--
-- Name: idx_assignment_views_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_views_assignment ON public.assignment_views USING btree (assignment_id);


--

--
-- Name: idx_assignment_views_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_views_user ON public.assignment_views USING btree (user_id);


--

--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.governance_audit_trail USING btree (action, occurred_at DESC);


--

--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.ministry_audit_log USING btree (entity_type, entity_id);


--

--
-- Name: idx_audit_school_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_school_time ON public.governance_audit_trail USING btree (school_id, occurred_at DESC);


--

--
-- Name: idx_audit_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_target ON public.governance_audit_trail USING btree (target_type, target_id);


--

--
-- Name: idx_audit_tenant_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant_time ON public.ministry_audit_log USING btree (tenant_id, created_at DESC);


--

--
-- Name: idx_calib_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calib_school ON public.confidence_calibration_stats USING btree (school_id, subject, topic);


--

--
-- Name: idx_cms_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_school ON public.cognitive_mirror_snapshots USING btree (school_id, created_at DESC);


--

--
-- Name: idx_cms_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_unresolved ON public.cognitive_mirror_snapshots USING btree (user_id) WHERE (resolved_at IS NULL);


--

--
-- Name: idx_cms_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_user ON public.cognitive_mirror_snapshots USING btree (user_id, created_at DESC);


--

--
-- Name: idx_concept_mastery_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concept_mastery_concept ON public.concept_mastery USING btree (concept_id);


--

--
-- Name: idx_concepts_lecture; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concepts_lecture ON public.concepts USING btree (lecture_id);


--

--
-- Name: idx_concepts_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concepts_school ON public.concepts USING btree (school_id);


--

--
-- Name: idx_concepts_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concepts_subject ON public.concepts USING btree (subject_id);


--

--
-- Name: idx_conf_resp_school_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_resp_school_topic ON public.confidence_responses USING btree (school_id, subject, topic);


--

--
-- Name: idx_conf_resp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_resp_user ON public.confidence_responses USING btree (user_id, created_at DESC);


--

--
-- Name: idx_curriculum_versions_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_curriculum_versions_school ON public.curriculum_versions USING btree (school_id);


--

--
-- Name: idx_decay_ref_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decay_ref_concept ON public.decay_refreshers USING btree (concept_mastery_id);


--

--
-- Name: idx_decay_ref_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decay_ref_user ON public.decay_refreshers USING btree (user_id, created_at DESC);


--

--
-- Name: idx_ext_audit_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_audit_req ON public.extension_audit_chats USING btree (request_id, created_at);


--

--
-- Name: idx_ext_bp_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_bp_conv ON public.extension_blueprints USING btree (conversation_id, version);


--

--
-- Name: idx_ext_bp_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_bp_tenant ON public.extension_blueprints USING btree (tenant_id, status);


--

--
-- Name: idx_ext_data_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_data_lookup ON public.extension_data USING btree (version_id, table_key);


--

--
-- Name: idx_ext_msgs_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_msgs_conv ON public.extension_messages USING btree (conversation_id, created_at);


--

--
-- Name: idx_ext_req_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_req_status ON public.extension_requests USING btree (status, submitted_at DESC);


--

--
-- Name: idx_ext_sandbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_sandbox ON public.extension_sandbox_data USING btree (blueprint_id, table_key);


--

--
-- Name: idx_ext_ver_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_ver_active ON public.extension_versions USING btree (tenant_id, active);


--

--
-- Name: idx_graded_events_user_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_graded_events_user_subject ON public.graded_events USING btree (user_id, subject, created_at DESC);


--

--
-- Name: idx_iph_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iph_question ON public.item_parameter_history USING btree (question_id, created_at DESC);


--

--
-- Name: idx_iph_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iph_subject ON public.item_parameter_history USING btree (subject, created_at DESC);


--

--
-- Name: idx_iq_test_results_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iq_test_results_user_id ON public.iq_test_results USING btree (user_id);


--

--
-- Name: idx_knowledge_gaps_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_gaps_unresolved ON public.knowledge_gaps USING btree (user_id, resolved) WHERE (resolved = false);


--

--
-- Name: idx_knowledge_gaps_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_gaps_user ON public.knowledge_gaps USING btree (user_id);


--

--
-- Name: idx_kt_seq_user_subj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kt_seq_user_subj ON public.kt_sequence_state USING btree (user_id, subject);


--

--
-- Name: idx_lectures_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lectures_school ON public.lectures USING btree (school_id);


--

--
-- Name: idx_lectures_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lectures_subject ON public.lectures USING btree (subject_id);


--

--
-- Name: idx_lms_school_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lms_school_mode ON public.learning_mode_sessions USING btree (school_id, mode, subject, topic);


--

--
-- Name: idx_lms_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lms_user_status ON public.learning_mode_sessions USING btree (user_id, status, started_at DESC);


--

--
-- Name: idx_lumina_api_usage_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lumina_api_usage_key ON public.lumina_api_usage USING btree (api_key_id, created_at DESC);


--

--
-- Name: idx_lumina_cost_school_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lumina_cost_school_date ON public.lumina_cost_ledger USING btree (school_id, usage_date DESC);


--

--
-- Name: idx_lumina_cost_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lumina_cost_user_date ON public.lumina_cost_ledger USING btree (user_id, usage_date DESC);


--

--
-- Name: idx_mastery_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mastery_school ON public.concept_mastery USING btree (school_id, subject, topic);


--

--
-- Name: idx_mastery_user_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mastery_user_due ON public.concept_mastery USING btree (user_id, next_review_at);


--

--
-- Name: idx_materials_user_subject_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_user_subject_grade ON public.materials USING btree (user_id, subject, grade);


--

--
-- Name: idx_mb_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mb_user ON public.morning_briefings USING btree (user_id, scheduled_for DESC);


--

--
-- Name: idx_mc_cs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_cs_tenant ON public.mc_curriculum_subjects USING btree (tenant_id, status);


--

--
-- Name: idx_mc_regions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_regions_tenant ON public.mc_regions USING btree (tenant_id);


--

--
-- Name: idx_mc_sle_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_sle_school ON public.mc_school_lifecycle_events USING btree (school_id, created_at DESC);


--

--
-- Name: idx_mcr_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcr_entity ON public.ministry_change_requests USING btree (entity_type, entity_id);


--

--
-- Name: idx_mcr_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcr_tenant_status ON public.ministry_change_requests USING btree (tenant_id, status);


--

--
-- Name: idx_meval_metrics_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meval_metrics_channel ON public.model_evaluation_metrics USING btree (channel, slice_kind);


--

--
-- Name: idx_meval_metrics_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meval_metrics_run ON public.model_evaluation_metrics USING btree (run_id);


--

--
-- Name: idx_meval_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meval_runs_created_at ON public.model_evaluation_runs USING btree (created_at DESC);


--

--
-- Name: idx_meval_runs_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meval_runs_scope ON public.model_evaluation_runs USING btree (scope, scope_key);


--

--
-- Name: idx_ministry_announcements_tenant_pub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ministry_announcements_tenant_pub ON public.ministry_announcements USING btree (tenant_id, published, published_at DESC);


--

--
-- Name: idx_mra_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mra_tenant ON public.ministry_role_assignments USING btree (tenant_id);


--

--
-- Name: idx_mra_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mra_user ON public.ministry_role_assignments USING btree (user_id);


--

--
-- Name: idx_note_snap_note; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_snap_note ON public.note_snapshots USING btree (note_id, snapshot_at DESC);


--

--
-- Name: idx_note_snap_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_snap_user ON public.note_snapshots USING btree (user_id, snapshot_at DESC);


--

--
-- Name: idx_overrides_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_active ON public.teacher_overrides USING btree (school_id, active, scope, student_id, subject) WHERE (active = true);


--

--
-- Name: idx_podcast_generations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_podcast_generations_user_id ON public.podcast_generations USING btree (user_id, created_at DESC);


--

--
-- Name: idx_qb_anchor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qb_anchor ON public.question_bank USING btree (subject, is_anchor) WHERE is_anchor;


--

--
-- Name: idx_qbank_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qbank_concept ON public.question_bank USING btree (concept_id);


--

--
-- Name: idx_qbank_discrimination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qbank_discrimination ON public.question_bank USING btree (discrimination_a) WHERE (discrimination_a >= 0.3);


--

--
-- Name: idx_qbank_elo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qbank_elo ON public.question_bank USING btree (subject, elo_rating);


--

--
-- Name: idx_qbank_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qbank_subject ON public.question_bank USING btree (subject);


--

--
-- Name: idx_rs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rs_due ON public.recall_schedule USING btree (user_id, due_at) WHERE (delivered_at IS NULL);


--

--
-- Name: idx_saved_lectures_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_lectures_user_created ON public.saved_lectures USING btree (user_id, created_at DESC);


--

--
-- Name: idx_student_memory_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_memory_type ON public.student_memory USING btree (user_id, memory_type);


--

--
-- Name: idx_student_memory_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_memory_user ON public.student_memory USING btree (user_id);


--

--
-- Name: idx_tenant_feature_flags_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_feature_flags_tenant ON public.tenant_feature_flags USING btree (tenant_id);


--

--
-- Name: idx_user_activity_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_created ON public.user_activity_log USING btree (created_at);


--

--
-- Name: idx_user_activity_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_type ON public.user_activity_log USING btree (activity_type);


--

--
-- Name: idx_user_activity_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_user_id ON public.user_activity_log USING btree (user_id);


--

--
-- Name: lesson_events_lesson_priority_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_events_lesson_priority_seq_idx ON public.lesson_events USING btree (lesson_id, priority, seq);


--

--
-- Name: lesson_events_lesson_seq_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lesson_events_lesson_seq_uidx ON public.lesson_events USING btree (lesson_id, seq);


--

--
-- Name: lesson_events_school_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_events_school_ts_idx ON public.lesson_events USING btree (school_id, ts DESC);


--

--
-- Name: lesson_explanations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_explanations_status_idx ON public.lesson_explanations USING btree (enforcement_status, created_at DESC);


--

--
-- Name: lesson_explanations_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_explanations_subject_idx ON public.lesson_explanations USING btree (subject, created_at DESC);


--

--
-- Name: lesson_explanations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_explanations_user_idx ON public.lesson_explanations USING btree (user_id, created_at DESC);


--

--
-- Name: lesson_sessions_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_sessions_lesson_idx ON public.lesson_sessions USING btree (lesson_id);


--

--
-- Name: lesson_sessions_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_sessions_student_idx ON public.lesson_sessions USING btree (student_id);


--

--
-- Name: lesson_state_snapshots_lesson_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_state_snapshots_lesson_seq_idx ON public.lesson_state_snapshots USING btree (lesson_id, seq DESC);


--

--
-- Name: live_meetings_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_meetings_lesson_idx ON public.live_meetings USING btree (lesson_id);


--

--
-- Name: live_meetings_school_grade_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_meetings_school_grade_status_idx ON public.live_meetings USING btree (school_id, grade_level, status);


--

--
-- Name: mi_events_region_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_region_time_idx ON public.mi_educational_events USING btree (region_id, occurred_at DESC);


--

--
-- Name: mi_events_school_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_school_time_idx ON public.mi_educational_events USING btree (school_id, occurred_at DESC);


--

--
-- Name: mi_events_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_subject_idx ON public.mi_educational_events USING btree (subject_id);


--

--
-- Name: mi_events_tenant_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_tenant_time_idx ON public.mi_educational_events USING btree (tenant_id, occurred_at DESC);


--

--
-- Name: mi_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_type_idx ON public.mi_educational_events USING btree (event_type);


--

--
-- Name: mi_insights_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_insights_scope_idx ON public.mi_insights USING btree (scope);


--

--
-- Name: mi_insights_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_insights_tenant_idx ON public.mi_insights USING btree (tenant_id, created_at DESC);


--

--
-- Name: mi_rollups_region_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_rollups_region_day_idx ON public.mi_daily_rollups USING btree (region_id, day DESC);


--

--
-- Name: mi_rollups_school_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_rollups_school_day_idx ON public.mi_daily_rollups USING btree (school_id, day DESC);


--

--
-- Name: mi_rollups_subject_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_rollups_subject_day_idx ON public.mi_daily_rollups USING btree (subject_id, day DESC);


--

--
-- Name: mi_rollups_tenant_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_rollups_tenant_day_idx ON public.mi_daily_rollups USING btree (tenant_id, day DESC);


--

--
-- Name: mi_rollups_unique_slice; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mi_rollups_unique_slice ON public.mi_daily_rollups USING btree (tenant_id, day, event_type, COALESCE(school_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(grade_level, ''::text));


--

--
-- Name: policy_evaluation_results_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_evaluation_results_run_idx ON public.policy_evaluation_results USING btree (run_id, policy_name, estimator);


--

--
-- Name: policy_regret_log_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_regret_log_subject_idx ON public.policy_regret_log USING btree (subject, created_at DESC);


--

--
-- Name: population_prior_runs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX population_prior_runs_created_idx ON public.population_prior_runs USING btree (created_at DESC);


--

--
-- Name: population_priors_concept_global_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_concept_global_uniq ON public.population_priors USING btree (concept_id) WHERE (scope = 'concept_global'::text);


--

--
-- Name: population_priors_concept_school_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_concept_school_uniq ON public.population_priors USING btree (school_id, concept_id) WHERE (scope = 'concept_school'::text);


--

--
-- Name: population_priors_global_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_global_uniq ON public.population_priors USING btree ((1)) WHERE (scope = 'global'::text);


--

--
-- Name: population_priors_school_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX population_priors_school_subject_idx ON public.population_priors USING btree (school_id, subject) WHERE (school_id IS NOT NULL);


--

--
-- Name: population_priors_scope_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX population_priors_scope_subject_idx ON public.population_priors USING btree (scope, subject);


--

--
-- Name: population_priors_subject_global_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_subject_global_uniq ON public.population_priors USING btree (subject) WHERE (scope = 'subject_global'::text);


--

--
-- Name: population_priors_subject_school_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_subject_school_uniq ON public.population_priors USING btree (school_id, subject) WHERE (scope = 'subject_school'::text);


--

--
-- Name: subjects_school_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subjects_school_slug_unique ON public.subjects USING btree (school_id, slug) WHERE (slug IS NOT NULL);


--

--
-- Name: teacher_categories_school_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teacher_categories_school_idx ON public.teacher_categories USING btree (school_id);


--

--
-- Name: teacher_categories_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teacher_categories_subject_idx ON public.teacher_categories USING btree (subject_id);


--

--
-- Name: unified_policy_decisions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unified_policy_decisions_user_idx ON public.unified_policy_decisions USING btree (user_id, created_at DESC);


--

--
-- Name: unified_state_user_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unified_state_user_subject_idx ON public.unified_student_state USING btree (user_id, subject, created_at DESC);


--

--
-- Name: uq_ensemble_user_subj; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ensemble_user_subj ON public.ensemble_weights USING btree (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), subject);


--

--
-- Name: activity_logs activity_logs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: admin_logs admin_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: admin_logs admin_logs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: announcement_reads announcement_reads_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--

--
-- Name: announcements announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--

--
-- Name: announcements announcements_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: assessment_scores assessment_scores_pilot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_scores
    ADD CONSTRAINT assessment_scores_pilot_id_fkey FOREIGN KEY (pilot_id) REFERENCES public.pilot_studies(id) ON DELETE SET NULL;


--

--
-- Name: assessment_scores assessment_scores_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_scores
    ADD CONSTRAINT assessment_scores_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: assignment_submissions assignment_submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--

--
-- Name: assignment_views assignment_views_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_views
    ADD CONSTRAINT assignment_views_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--

--
-- Name: assignments assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--

--
-- Name: assignments assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: assignments assignments_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: attendance attendance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--

--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: attendance attendance_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id);


--

--
-- Name: awards awards_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: awards awards_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: awards awards_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id);


--

--
-- Name: bandit_arm_state bandit_arm_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandit_arm_state
    ADD CONSTRAINT bandit_arm_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: bandit_decisions bandit_decisions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandit_decisions
    ADD CONSTRAINT bandit_decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: chat_messages chat_messages_chat_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_chat_room_id_fkey FOREIGN KEY (chat_room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--

--
-- Name: chat_rooms chat_rooms_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: classes classes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: concept_mastery concept_mastery_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE SET NULL;


--

--
-- Name: concept_standard_map concept_standard_map_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.learning_objectives(id) ON DELETE SET NULL;


--

--
-- Name: concept_standard_map concept_standard_map_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: concept_standard_map concept_standard_map_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_standard_id_fkey FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id) ON DELETE CASCADE;


--

--
-- Name: concepts concepts_lecture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_lecture_id_fkey FOREIGN KEY (lecture_id) REFERENCES public.lectures(id) ON DELETE CASCADE;


--

--
-- Name: concepts concepts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: concepts concepts_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: content_flags content_flags_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: course_materials course_materials_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: course_materials course_materials_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: curriculum_standards curriculum_standards_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.curriculum_standards(id) ON DELETE SET NULL;


--

--
-- Name: curriculum_standards curriculum_standards_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: curriculum_standards curriculum_standards_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: curriculum_versions curriculum_versions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_versions
    ADD CONSTRAINT curriculum_versions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: curriculum_versions curriculum_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_versions
    ADD CONSTRAINT curriculum_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: data_export_requests data_export_requests_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_export_requests
    ADD CONSTRAINT data_export_requests_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: decay_refreshers decay_refreshers_concept_mastery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decay_refreshers
    ADD CONSTRAINT decay_refreshers_concept_mastery_id_fkey FOREIGN KEY (concept_mastery_id) REFERENCES public.concept_mastery(id) ON DELETE CASCADE;


--

--
-- Name: engine_drift_alerts engine_drift_alerts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_drift_alerts
    ADD CONSTRAINT engine_drift_alerts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.continuous_validation_runs(id) ON DELETE CASCADE;


--

--
-- Name: ensemble_fit_runs ensemble_fit_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_fit_runs
    ADD CONSTRAINT ensemble_fit_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: ensemble_predictions ensemble_predictions_bandit_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_predictions
    ADD CONSTRAINT ensemble_predictions_bandit_decision_id_fkey FOREIGN KEY (bandit_decision_id) REFERENCES public.bandit_decisions(id) ON DELETE SET NULL;


--

--
-- Name: ensemble_predictions ensemble_predictions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_predictions
    ADD CONSTRAINT ensemble_predictions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: ensemble_weights ensemble_weights_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_weights
    ADD CONSTRAINT ensemble_weights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: exam_submissions exam_submissions_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--

--
-- Name: exam_submissions exam_submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: exams exams_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: exams exams_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: exams exams_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: extension_audit_chats extension_audit_chats_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_audit_chats
    ADD CONSTRAINT extension_audit_chats_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.extension_requests(id) ON DELETE CASCADE;


--

--
-- Name: extension_blueprints extension_blueprints_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_blueprints
    ADD CONSTRAINT extension_blueprints_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.extension_conversations(id) ON DELETE CASCADE;


--

--
-- Name: extension_blueprints extension_blueprints_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_blueprints
    ADD CONSTRAINT extension_blueprints_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_conversations extension_conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_conversations
    ADD CONSTRAINT extension_conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_data extension_data_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_data
    ADD CONSTRAINT extension_data_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);


--

--
-- Name: extension_data extension_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_data
    ADD CONSTRAINT extension_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_data extension_data_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_data
    ADD CONSTRAINT extension_data_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.extension_versions(id) ON DELETE CASCADE;


--

--
-- Name: extension_messages extension_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_messages
    ADD CONSTRAINT extension_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.extension_conversations(id) ON DELETE CASCADE;


--

--
-- Name: extension_messages extension_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_messages
    ADD CONSTRAINT extension_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_requests extension_requests_blueprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.extension_blueprints(id) ON DELETE CASCADE;


--

--
-- Name: extension_requests extension_requests_reviewer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_reviewer_user_id_fkey FOREIGN KEY (reviewer_user_id) REFERENCES auth.users(id);


--

--
-- Name: extension_requests extension_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_sandbox_data extension_sandbox_data_blueprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_sandbox_data
    ADD CONSTRAINT extension_sandbox_data_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.extension_blueprints(id) ON DELETE CASCADE;


--

--
-- Name: extension_sandbox_data extension_sandbox_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_sandbox_data
    ADD CONSTRAINT extension_sandbox_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_versions extension_versions_blueprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.extension_blueprints(id) ON DELETE CASCADE;


--

--
-- Name: extension_versions extension_versions_deployed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_deployed_by_user_id_fkey FOREIGN KEY (deployed_by_user_id) REFERENCES auth.users(id);


--

--
-- Name: extension_versions extension_versions_rolled_back_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_rolled_back_by_fkey FOREIGN KEY (rolled_back_by) REFERENCES auth.users(id);


--

--
-- Name: extension_versions extension_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: fsrs_card_state fsrs_card_state_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fsrs_card_state
    ADD CONSTRAINT fsrs_card_state_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;


--

--
-- Name: fsrs_card_state fsrs_card_state_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fsrs_card_state
    ADD CONSTRAINT fsrs_card_state_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--

--
-- Name: fsrs_card_state fsrs_card_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fsrs_card_state
    ADD CONSTRAINT fsrs_card_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: graded_events graded_events_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graded_events
    ADD CONSTRAINT graded_events_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.question_bank(id) ON DELETE SET NULL;


--

--
-- Name: hyperparameter_settings hyperparameter_settings_source_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hyperparameter_settings
    ADD CONSTRAINT hyperparameter_settings_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES public.hyperparameter_tuning_runs(id) ON DELETE SET NULL;


--

--
-- Name: hyperparameter_tuning_runs hyperparameter_tuning_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hyperparameter_tuning_runs
    ADD CONSTRAINT hyperparameter_tuning_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: invite_codes invite_codes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--

--
-- Name: invite_codes invite_codes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: invite_codes invite_codes_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: invite_codes invite_codes_teacher_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_teacher_category_id_fkey FOREIGN KEY (teacher_category_id) REFERENCES public.teacher_categories(id) ON DELETE CASCADE;


--

--
-- Name: invite_codes invite_codes_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);


--

--
-- Name: invite_requests invite_requests_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_requests
    ADD CONSTRAINT invite_requests_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.invite_codes(id) ON DELETE CASCADE;


--

--
-- Name: invite_requests invite_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_requests
    ADD CONSTRAINT invite_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--

--
-- Name: item_parameter_history item_parameter_history_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_parameter_history
    ADD CONSTRAINT item_parameter_history_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.question_bank(id) ON DELETE CASCADE;


--

--
-- Name: knowledge_gaps knowledge_gaps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_gaps
    ADD CONSTRAINT knowledge_gaps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: kt_sequence_state kt_sequence_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kt_sequence_state
    ADD CONSTRAINT kt_sequence_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_locks lct_exam_locks_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_locks
    ADD CONSTRAINT lct_exam_locks_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.lct_exams(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_locks lct_exam_locks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_locks
    ADD CONSTRAINT lct_exam_locks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: lct_exam_schools lct_exam_schools_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_schools
    ADD CONSTRAINT lct_exam_schools_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.lct_exams(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_schools lct_exam_schools_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_schools
    ADD CONSTRAINT lct_exam_schools_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_students lct_exam_students_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.lct_exams(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_students lct_exam_students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_students lct_exam_students_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: lct_exams lct_exams_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exams
    ADD CONSTRAINT lct_exams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: learning_objectives learning_objectives_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_standard_id_fkey FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id) ON DELETE CASCADE;


--

--
-- Name: learning_outcomes learning_outcomes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_outcomes
    ADD CONSTRAINT learning_outcomes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lectures lectures_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lectures
    ADD CONSTRAINT lectures_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lectures lectures_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lectures
    ADD CONSTRAINT lectures_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: lesson_explanations lesson_explanations_bandit_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_explanations
    ADD CONSTRAINT lesson_explanations_bandit_decision_id_fkey FOREIGN KEY (bandit_decision_id) REFERENCES public.bandit_decisions(id) ON DELETE SET NULL;


--

--
-- Name: lesson_explanations lesson_explanations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_explanations
    ADD CONSTRAINT lesson_explanations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: lesson_objective_bindings lesson_objective_bindings_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_objective_bindings
    ADD CONSTRAINT lesson_objective_bindings_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.learning_objectives(id) ON DELETE SET NULL;


--

--
-- Name: lesson_objective_bindings lesson_objective_bindings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_objective_bindings
    ADD CONSTRAINT lesson_objective_bindings_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lesson_objective_bindings lesson_objective_bindings_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_objective_bindings
    ADD CONSTRAINT lesson_objective_bindings_standard_id_fkey FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id) ON DELETE SET NULL;


--

--
-- Name: lesson_plans lesson_plans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lesson_plans lesson_plans_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: lesson_plans lesson_plans_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: live_meetings live_meetings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_meetings
    ADD CONSTRAINT live_meetings_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: material_comments material_comments_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_comments
    ADD CONSTRAINT material_comments_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.course_materials(id) ON DELETE CASCADE;


--

--
-- Name: material_comments material_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_comments
    ADD CONSTRAINT material_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: material_views material_views_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_views
    ADD CONSTRAINT material_views_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.course_materials(id) ON DELETE CASCADE;


--

--
-- Name: material_views material_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_views
    ADD CONSTRAINT material_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: mc_curriculum_subjects mc_curriculum_subjects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_subjects
    ADD CONSTRAINT mc_curriculum_subjects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_curriculum_subjects mc_curriculum_subjects_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_subjects
    ADD CONSTRAINT mc_curriculum_subjects_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.mc_curriculum_version_defs(id) ON DELETE SET NULL;


--

--
-- Name: mc_curriculum_version_defs mc_curriculum_version_defs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_version_defs
    ADD CONSTRAINT mc_curriculum_version_defs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_educational_policies mc_educational_policies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_educational_policies
    ADD CONSTRAINT mc_educational_policies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_lumina_config mc_lumina_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_lumina_config
    ADD CONSTRAINT mc_lumina_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_regions mc_regions_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_regions
    ADD CONSTRAINT mc_regions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.mc_regions(id) ON DELETE SET NULL;


--

--
-- Name: mc_regions mc_regions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_regions
    ADD CONSTRAINT mc_regions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_lifecycle_events mc_school_lifecycle_events_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_lifecycle_events
    ADD CONSTRAINT mc_school_lifecycle_events_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_lifecycle_events mc_school_lifecycle_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_lifecycle_events
    ADD CONSTRAINT mc_school_lifecycle_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.mc_regions(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--

--
-- Name: mi_daily_rollups mi_daily_rollups_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.mc_regions(id) ON DELETE SET NULL;


--

--
-- Name: mi_daily_rollups mi_daily_rollups_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: mi_daily_rollups mi_daily_rollups_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: mi_daily_rollups mi_daily_rollups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mi_educational_events mi_educational_events_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.mc_regions(id) ON DELETE SET NULL;


--

--
-- Name: mi_educational_events mi_educational_events_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--

--
-- Name: mi_educational_events mi_educational_events_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: mi_educational_events mi_educational_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mi_insights mi_insights_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.mc_regions(id) ON DELETE SET NULL;


--

--
-- Name: mi_insights mi_insights_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: mi_insights mi_insights_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: mi_insights mi_insights_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mind_map_history mind_map_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_map_history
    ADD CONSTRAINT mind_map_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: ministry_access_codes ministry_access_codes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_codes
    ADD CONSTRAINT ministry_access_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: ministry_access_requests ministry_access_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_requests
    ADD CONSTRAINT ministry_access_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: ministry_announcements ministry_announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_announcements
    ADD CONSTRAINT ministry_announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: ministry_announcements ministry_announcements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_announcements
    ADD CONSTRAINT ministry_announcements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: ministry_audit_log ministry_audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_audit_log
    ADD CONSTRAINT ministry_audit_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--

--
-- Name: ministry_change_requests ministry_change_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_change_requests
    ADD CONSTRAINT ministry_change_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: ministry_ip_bans ministry_ip_bans_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_ip_bans
    ADD CONSTRAINT ministry_ip_bans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: ministry_role_assignments ministry_role_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_role_assignments
    ADD CONSTRAINT ministry_role_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: ministry_sessions ministry_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_sessions
    ADD CONSTRAINT ministry_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: misconception_embeddings misconception_embeddings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception_embeddings
    ADD CONSTRAINT misconception_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: model_evaluation_metrics model_evaluation_metrics_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_evaluation_metrics
    ADD CONSTRAINT model_evaluation_metrics_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.model_evaluation_runs(id) ON DELETE CASCADE;


--

--
-- Name: model_evaluation_runs model_evaluation_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_evaluation_runs
    ADD CONSTRAINT model_evaluation_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: moderation_actions moderation_actions_flag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_flag_id_fkey FOREIGN KEY (flag_id) REFERENCES public.content_flags(id);


--

--
-- Name: moderation_actions moderation_actions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: moderator_invite_codes moderator_invite_codes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_invite_codes
    ADD CONSTRAINT moderator_invite_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: moderator_requests moderator_requests_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_requests
    ADD CONSTRAINT moderator_requests_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.moderator_invite_codes(id);


--

--
-- Name: note_snapshots note_snapshots_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_snapshots
    ADD CONSTRAINT note_snapshots_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--

--
-- Name: note_timeline_summaries note_timeline_summaries_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_timeline_summaries
    ADD CONSTRAINT note_timeline_summaries_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--

--
-- Name: parent_invite_codes parent_invite_codes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_invite_codes
    ADD CONSTRAINT parent_invite_codes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: parent_students parent_students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_students
    ADD CONSTRAINT parent_students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: pilot_assignments pilot_assignments_pilot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_assignments
    ADD CONSTRAINT pilot_assignments_pilot_id_fkey FOREIGN KEY (pilot_id) REFERENCES public.pilot_studies(id) ON DELETE CASCADE;


--

--
-- Name: pilot_studies pilot_studies_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_studies
    ADD CONSTRAINT pilot_studies_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: policy_evaluation_results policy_evaluation_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_evaluation_results
    ADD CONSTRAINT policy_evaluation_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.policy_evaluation_runs(id) ON DELETE CASCADE;


--

--
-- Name: policy_evaluation_runs policy_evaluation_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_evaluation_runs
    ADD CONSTRAINT policy_evaluation_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: policy_regret_log policy_regret_log_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_regret_log
    ADD CONSTRAINT policy_regret_log_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.bandit_decisions(id) ON DELETE CASCADE;


--

--
-- Name: policy_regret_log policy_regret_log_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_regret_log
    ADD CONSTRAINT policy_regret_log_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.policy_evaluation_runs(id) ON DELETE SET NULL;


--

--
-- Name: policy_regret_log policy_regret_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_regret_log
    ADD CONSTRAINT policy_regret_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: population_prior_runs population_prior_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_prior_runs
    ADD CONSTRAINT population_prior_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: population_priors population_priors_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_priors
    ADD CONSTRAINT population_priors_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;


--

--
-- Name: population_priors population_priors_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_priors
    ADD CONSTRAINT population_priors_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: profiles profiles_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: profiles profiles_teacher_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_teacher_category_id_fkey FOREIGN KEY (teacher_category_id) REFERENCES public.teacher_categories(id) ON DELETE SET NULL;


--

--
-- Name: profiles profiles_teacher_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_teacher_subject_id_fkey FOREIGN KEY (teacher_subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: report_cards report_cards_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: report_cards report_cards_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

--
-- Name: report_cards report_cards_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: school_admins school_admins_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: school_admins school_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: schools schools_code_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_code_used_by_fkey FOREIGN KEY (code_used_by) REFERENCES auth.users(id);


--

--
-- Name: schools schools_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: student_classes student_classes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--

--
-- Name: student_classes student_classes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: student_memory student_memory_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_memory
    ADD CONSTRAINT student_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: subjects subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: submissions submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--

--
-- Name: submissions submissions_graded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES auth.users(id);


--

--
-- Name: submissions submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: teacher_categories teacher_categories_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_categories
    ADD CONSTRAINT teacher_categories_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: teacher_categories teacher_categories_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_categories
    ADD CONSTRAINT teacher_categories_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: teacher_overrides teacher_overrides_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_overrides
    ADD CONSTRAINT teacher_overrides_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: teacher_requests teacher_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_requests
    ADD CONSTRAINT teacher_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: teacher_subjects teacher_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: teacher_subjects teacher_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: tenant_feature_flags tenant_feature_flags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: tenant_roles tenant_roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT tenant_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: tenant_roles tenant_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT tenant_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: topic_locks topic_locks_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_locks
    ADD CONSTRAINT topic_locks_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: trip_reads trip_reads_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_reads
    ADD CONSTRAINT trip_reads_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;


--

--
-- Name: trips trips_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: unified_policy_decisions unified_policy_decisions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_decisions
    ADD CONSTRAINT unified_policy_decisions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--

--
-- Name: unified_policy_decisions unified_policy_decisions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_decisions
    ADD CONSTRAINT unified_policy_decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: unified_student_state unified_student_state_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_student_state
    ADD CONSTRAINT unified_student_state_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--

--
-- Name: unified_student_state unified_student_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_student_state
    ADD CONSTRAINT unified_student_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: user_strikes user_strikes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strikes
    ADD CONSTRAINT user_strikes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: weekly_plans weekly_plans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT weekly_plans_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
