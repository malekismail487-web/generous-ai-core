-- Canonical Lumina schema source: row-level security and policies
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Canonical replacement for historical policy: user_roles Admins can delete user roles
--

CREATE POLICY "Super Admin can delete user roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_super_admin());

--
-- Name: admin_logs Admins can insert logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert logs" ON public.admin_logs FOR INSERT WITH CHECK ((admin_id = auth.uid()));


--

--
-- Canonical replacement for historical policy: user_roles Admins can insert user roles
--

CREATE POLICY "Super Admin can insert user roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

--
-- Canonical replacement for historical policy: teacher_requests Admins can update requests
--

CREATE POLICY "School Admin can update school teacher requests" ON public.teacher_requests FOR UPDATE TO authenticated USING (public.is_school_admin_of(auth.uid(), (SELECT p.school_id FROM public.profiles p WHERE p.id = teacher_requests.user_id)) OR public.is_super_admin()) WITH CHECK (public.is_school_admin_of(auth.uid(), (SELECT p.school_id FROM public.profiles p WHERE p.id = teacher_requests.user_id)) OR public.is_super_admin());

--
-- Canonical replacement for historical policy: user_strikes Admins can update strikes
--

CREATE POLICY "School Admin can update school strikes" ON public.user_strikes FOR UPDATE TO authenticated USING (public.is_school_admin_of(auth.uid(), user_strikes.school_id) OR public.is_super_admin()) WITH CHECK (public.is_school_admin_of(auth.uid(), user_strikes.school_id) OR public.is_super_admin());

--
-- Canonical replacement for historical policy: teacher_requests Admins can view all requests
--

CREATE POLICY "School Admin can view school teacher requests" ON public.teacher_requests FOR SELECT TO authenticated USING (public.is_school_admin_of(auth.uid(), (SELECT p.school_id FROM public.profiles p WHERE p.id = teacher_requests.user_id)) OR public.is_super_admin());

--
-- Canonical replacement for historical policy: schools Admins can view all schools
--

CREATE POLICY "Super Admin can view all schools" ON public.schools FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: lesson_explanations Admins read all explanations
--

CREATE POLICY "Super Admin reads all explanations" ON public.lesson_explanations FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: lesson_events Admins read all lesson events
--

CREATE POLICY "Super Admin reads all lesson events" ON public.lesson_events FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: policy_regret_log Admins read all regret
--

CREATE POLICY "Super Admin reads all policy regret" ON public.policy_regret_log FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: engine_drift_alerts Admins read drift alerts
--

CREATE POLICY "Super Admin reads drift alerts" ON public.engine_drift_alerts FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: hyperparameter_tuning_runs Admins read hp tuning runs
--

CREATE POLICY "Super Admin reads tuning runs" ON public.hyperparameter_tuning_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: policy_evaluation_results Admins read policy eval results
--

CREATE POLICY "Super Admin reads policy evaluation results" ON public.policy_evaluation_results FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: policy_evaluation_runs Admins read policy eval runs
--

CREATE POLICY "Super Admin reads policy evaluation runs" ON public.policy_evaluation_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: population_prior_runs Admins read prior run audit
--

CREATE POLICY "Super Admin reads population prior runs" ON public.population_prior_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: continuous_validation_runs Admins read validation runs
--

CREATE POLICY "Super Admin reads validation runs" ON public.continuous_validation_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: live_meetings Admins view all meetings in school
--

CREATE POLICY "School Admin views school meetings" ON public.live_meetings FOR SELECT TO authenticated USING (public.is_school_admin_of(auth.uid(), live_meetings.school_id) OR public.is_super_admin());

--
-- Name: ministry_access_requests Anonymous can read own pending request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anonymous can read own pending request" ON public.ministry_access_requests FOR SELECT USING ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])));


--

--
-- Name: question_bank Any signed-in user can read questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Any signed-in user can read questions" ON public.question_bank FOR SELECT TO authenticated USING (true);


--

--
-- Name: ministry_sessions Anyone can read ministry sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read ministry sessions" ON public.ministry_sessions FOR SELECT USING (true);


--

--
-- Name: material_comments Anyone can view comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view comments" ON public.material_comments FOR SELECT TO authenticated USING (true);


--

--
-- Name: calibration_state Anyone signed in can read calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone signed in can read calibration" ON public.calibration_state FOR SELECT TO authenticated USING (true);


--

--
-- Name: ministry_change_appliers Appliers readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Appliers readable by authenticated" ON public.ministry_change_appliers FOR SELECT USING (true);


--

--
-- Name: chat_messages Approved users can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can send messages" ON public.chat_messages FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text))))));


--

--
-- Name: ministry_audit_log Audit insert self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit insert self" ON public.ministry_audit_log FOR INSERT WITH CHECK (true);


--

--
-- Name: ministry_audit_log Audit super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit super admin read" ON public.ministry_audit_log FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: ministry_audit_log Audit tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit tenant read" ON public.ministry_audit_log FOR SELECT USING (((tenant_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.ministry_role_assignments mra
  WHERE ((mra.user_id = auth.uid()) AND (mra.tenant_id = ministry_audit_log.tenant_id))))));


--

--
-- Name: hyperparameter_settings Authenticated read hp settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read hp settings" ON public.hyperparameter_settings FOR SELECT TO authenticated USING (true);


--

--
-- Name: graded_events Authorised viewers read graded events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorised viewers read graded events" ON public.graded_events FOR SELECT TO authenticated USING (public.can_view_student_mastery(auth.uid(), user_id));


--

--
-- Name: ability_estimates Authorised viewers read student ability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorised viewers read student ability" ON public.ability_estimates FOR SELECT TO authenticated USING (public.can_view_student_mastery(auth.uid(), user_id));


--

--
-- Name: bandit_decisions Authorized viewers read student bandit decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized viewers read student bandit decisions" ON public.bandit_decisions FOR SELECT TO authenticated USING (public.can_view_student_mastery(auth.uid(), user_id));


--

--
-- Name: bandit_arm_state Authorized viewers read student bandit state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized viewers read student bandit state" ON public.bandit_arm_state FOR SELECT TO authenticated USING (((scope = 'user'::text) AND (user_id IS NOT NULL) AND public.can_view_student_mastery(auth.uid(), user_id)));


--

--
-- Name: ensemble_fit_runs Authorized viewers read student fit runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized viewers read student fit runs" ON public.ensemble_fit_runs FOR SELECT TO authenticated USING (((scope = 'user'::text) AND (user_id IS NOT NULL) AND public.can_view_student_mastery(auth.uid(), user_id)));


--

--
-- Name: ensemble_predictions Authorized viewers read student predictions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized viewers read student predictions" ON public.ensemble_predictions FOR SELECT TO authenticated USING (public.can_view_student_mastery(auth.uid(), user_id));


--

--
-- Name: ministry_capabilities Capabilities readable by all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Capabilities readable by all" ON public.ministry_capabilities FOR SELECT USING (true);


--

--
-- Canonical replacement for historical policy: chat_rooms Chat room creators can delete
--

CREATE POLICY "Chat room creators and School Admin can delete" ON public.chat_rooms FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_school_admin_of(auth.uid(), chat_rooms.school_id) OR public.is_super_admin());

--
-- Name: ministry_change_requests MCR super admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MCR super admin all" ON public.ministry_change_requests USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: ministry_change_requests MCR tenant members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MCR tenant members read" ON public.ministry_change_requests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.ministry_role_assignments mra
  WHERE ((mra.user_id = auth.uid()) AND (mra.tenant_id = ministry_change_requests.tenant_id)))));


--

--
-- Name: ministry_role_assignments MRA self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MRA self read" ON public.ministry_role_assignments FOR SELECT USING (((user_id = auth.uid()) OR public.is_super_admin_caller()));


--

--
-- Name: ministry_role_assignments MRA super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MRA super admin write" ON public.ministry_role_assignments USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: moderation_actions Moderators can manage actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moderators can manage actions" ON public.moderation_actions USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'moderator'::text) AND (profiles.is_active = true)))) OR public.is_super_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'moderator'::text) AND (profiles.is_active = true)))) OR public.is_super_admin()));


--

--
-- Name: content_flags Moderators can update flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moderators can update flags" ON public.content_flags FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'moderator'::text) AND (profiles.is_active = true)))) OR public.is_super_admin()));


--

--
-- Name: content_flags Moderators can view all flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moderators can view all flags" ON public.content_flags FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'moderator'::text) AND (profiles.is_active = true)))) OR public.is_super_admin()));


--

--
-- Name: ministry_access_codes No direct access to ministry codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct access to ministry codes" ON public.ministry_access_codes FOR SELECT USING (false);


--

--
-- Name: assignment_submissions Parents can view child assignment submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child assignment submissions" ON public.assignment_submissions FOR SELECT USING ((student_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: assignments Parents can view child assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child assignments" ON public.assignments FOR SELECT USING ((school_id IN ( SELECT parent_students.school_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: attendance Parents can view child attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child attendance" ON public.attendance FOR SELECT USING ((student_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: student_learning_profiles Parents can view child learning profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child learning profiles" ON public.student_learning_profiles FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: report_cards Parents can view child report cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child report cards" ON public.report_cards FOR SELECT USING ((student_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: parent_students Parents can view child school data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child school data" ON public.parent_students FOR SELECT USING ((parent_id = auth.uid()));


--

--
-- Name: daily_streaks Parents can view child streaks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child streaks" ON public.daily_streaks FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: submissions Parents can view child submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child submissions" ON public.submissions FOR SELECT USING ((student_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: announcements Parents can view school announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view school announcements" ON public.announcements FOR SELECT USING ((school_id IN ( SELECT parent_students.school_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: profiles Parents can view their child profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view their child profile" ON public.profiles FOR SELECT USING ((id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: parent_students Parents can view their links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view their links" ON public.parent_students FOR SELECT USING ((parent_id = auth.uid()));


--

--
-- Name: lesson_events Participants read events for their meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants read events for their meetings" ON public.lesson_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.live_meetings m
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((m.lesson_id = lesson_events.lesson_id) AND (p.school_id = m.school_id) AND ((m.teacher_id = auth.uid()) OR (p.grade_level = m.grade_level))))));


--

--
-- Name: ensemble_fit_runs Population fits readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Population fits readable" ON public.ensemble_fit_runs FOR SELECT TO authenticated USING ((scope = 'population'::text));


--

--
-- Name: bandit_arm_state Population priors readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Population priors readable" ON public.bandit_arm_state FOR SELECT TO authenticated USING ((scope = 'population'::text));


--

--
-- Name: tenants Read active visible tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read active visible tenants" ON public.tenants FOR SELECT TO authenticated USING (((status = 'active'::text) AND (is_visible = true)));


--

--
-- Name: moderation_actions School admins can appeal actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can appeal actions" ON public.moderation_actions FOR UPDATE USING (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Canonical replacement for historical policy: user_strikes School admins can issue strikes
--

CREATE POLICY "School Admin can issue school strikes" ON public.user_strikes FOR INSERT TO authenticated WITH CHECK (issued_by = auth.uid() AND public.is_school_admin_of(auth.uid(), user_strikes.school_id));

--
-- Name: announcements School admins can manage announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage announcements" ON public.announcements USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: classes School admins can manage classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage classes" ON public.classes USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: invite_codes School admins can manage invite codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage invite codes" ON public.invite_codes USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: invite_requests School admins can manage invite requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage invite requests" ON public.invite_requests USING ((EXISTS ( SELECT 1
   FROM public.invite_codes ic
  WHERE ((ic.id = invite_requests.code_id) AND public.is_school_admin_of(auth.uid(), ic.school_id)))));


--

--
-- Name: report_cards School admins can manage report cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage report cards" ON public.report_cards USING (public.is_school_admin_of(auth.uid(), school_id)) WITH CHECK (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: student_classes School admins can manage student classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage student classes" ON public.student_classes USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = student_classes.class_id) AND public.is_school_admin_of(auth.uid(), c.school_id)))));


--

--
-- Name: subjects School admins can manage subjects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage subjects" ON public.subjects USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: teacher_subjects School admins can manage teacher subjects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage teacher subjects" ON public.teacher_subjects USING ((EXISTS ( SELECT 1
   FROM public.subjects s
  WHERE ((s.id = teacher_subjects.subject_id) AND public.is_school_admin_of(auth.uid(), s.school_id)))));


--

--
-- Name: trips School admins can manage trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage trips" ON public.trips USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: weekly_plans School admins can manage weekly plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage weekly plans" ON public.weekly_plans USING ((EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = weekly_plans.school_id) AND (sa.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = weekly_plans.school_id) AND (sa.user_id = auth.uid())))));


--

--
-- Name: mi_educational_events School admins can read own-school events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can read own-school events" ON public.mi_educational_events FOR SELECT TO authenticated USING (((school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = mi_educational_events.school_id) AND (sa.user_id = auth.uid()))))));


--

--
-- Name: profiles School admins can update school profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can update school profiles" ON public.profiles FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.user_id = auth.uid()) AND (sa.school_id = profiles.school_id)))));


--

--
-- Name: attendance School admins can view all attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all attendance" ON public.attendance FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = attendance.class_id) AND public.is_school_admin_of(auth.uid(), c.school_id)))));


--

--
-- Name: lesson_plans School admins can view all lesson plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all lesson plans" ON public.lesson_plans FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: announcement_reads School admins can view all reads for their announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all reads for their announcements" ON public.announcement_reads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.announcements a
  WHERE ((a.id = announcement_reads.announcement_id) AND public.is_school_admin_of(auth.uid(), a.school_id)))));


--

--
-- Name: report_cards School admins can view all report cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all report cards" ON public.report_cards FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: trip_reads School admins can view all trip reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all trip reads" ON public.trip_reads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.id = trip_reads.trip_id) AND public.is_school_admin_of(auth.uid(), t.school_id)))));


--

--
-- Name: parent_invite_codes School admins can view parent codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view parent codes" ON public.parent_invite_codes FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: parent_students School admins can view parent links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view parent links" ON public.parent_students FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: moderation_actions School admins can view school actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view school actions" ON public.moderation_actions FOR SELECT USING (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: activity_logs School admins can view school activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view school activity" ON public.activity_logs FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: profiles School admins can view school profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view school profiles" ON public.profiles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.user_id = auth.uid()) AND (sa.school_id = profiles.school_id)))));


--

--
-- Name: user_strikes School admins can view school strikes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view school strikes" ON public.user_strikes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.school_admins
  WHERE ((school_admins.user_id = auth.uid()) AND (school_admins.school_id = user_strikes.school_id)))));


--

--
-- Name: student_learning_profiles School admins can view student learning profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view student learning profiles" ON public.student_learning_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.profiles student_p
     JOIN public.profiles admin_p ON ((admin_p.id = auth.uid())))
  WHERE ((student_p.id = student_learning_profiles.user_id) AND (student_p.school_id = admin_p.school_id) AND (admin_p.user_type = 'school_admin'::text) AND (admin_p.is_active = true)))));


--

--
-- Name: submissions School admins can view submissions in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view submissions in their school" ON public.submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.assignments a
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((a.id = submissions.assignment_id) AND (a.school_id = p.school_id) AND (p.user_type = 'school_admin'::text) AND (p.is_active = true)))));


--

--
-- Name: admin_logs School admins can view their logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view their logs" ON public.admin_logs FOR SELECT USING (((admin_id = auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: teacher_categories School admins manage teacher_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins manage teacher_categories" ON public.teacher_categories TO authenticated USING (public.is_school_admin_of(auth.uid(), school_id)) WITH CHECK (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: mi_insights School admins read own-school insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins read own-school insights" ON public.mi_insights FOR SELECT TO authenticated USING (((scope = 'school'::public.mi_insight_scope) AND (school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = mi_insights.school_id) AND (sa.user_id = auth.uid()))))));


--

--
-- Name: mi_daily_rollups School admins read own-school rollups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins read own-school rollups" ON public.mi_daily_rollups FOR SELECT TO authenticated USING (((school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = mi_daily_rollups.school_id) AND (sa.user_id = auth.uid()))))));


--

--
-- Name: lesson_state_snapshots School members read snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School members read snapshots" ON public.lesson_state_snapshots FOR SELECT TO authenticated USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: teacher_categories School members read teacher_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School members read teacher_categories" ON public.teacher_categories FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) OR public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: knowledge_gaps Service role full access gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access gaps" ON public.knowledge_gaps TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: student_memory Service role full access memory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access memory" ON public.student_memory TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: lesson_events Staff read school lesson events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read school lesson events" ON public.lesson_events FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])))))));


--

--
-- Name: lesson_sessions Staff read school sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read school sessions" ON public.lesson_sessions FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])))))));


--

--
-- Name: lesson_state_snapshots Staff write snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff write snapshots" ON public.lesson_state_snapshots FOR INSERT TO authenticated WITH CHECK (((school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])))))));


--

--
-- Name: exam_submissions Students can manage their exam submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can manage their exam submissions" ON public.exam_submissions USING ((student_id = auth.uid()));


--

--
-- Name: submissions Students can manage their submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can manage their submissions" ON public.submissions USING ((student_id = auth.uid()));


--

--
-- Name: assignment_views Students can record their assignment views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can record their assignment views" ON public.assignment_views FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: assignment_submissions Students can submit assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can submit assignments" ON public.assignment_submissions FOR INSERT WITH CHECK ((auth.uid() = student_id));


--

--
-- Name: lct_exam_students Students can update their own lct exam answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can update their own lct exam answers" ON public.lct_exam_students FOR UPDATE USING ((student_id = auth.uid()));


--

--
-- Name: assignment_submissions Students can update their ungraded submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can update their ungraded submissions" ON public.assignment_submissions FOR UPDATE USING (((student_id = auth.uid()) AND (graded_at IS NULL)));


--

--
-- Name: exams Students can view published exams in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view published exams in their school" ON public.exams FOR SELECT USING (((school_id = public.get_user_school_id(auth.uid())) AND (is_published = true)));


--

--
-- Name: lesson_plans Students can view published lesson plans in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view published lesson plans in their school" ON public.lesson_plans FOR SELECT USING (((school_id = public.get_user_school_id(auth.uid())) AND (is_published = true)));


--

--
-- Name: attendance Students can view their attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their attendance" ON public.attendance FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: awards Students can view their awards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their awards" ON public.awards FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: student_classes Students can view their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their classes" ON public.student_classes FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: assignment_views Students can view their own assignment views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own assignment views" ON public.assignment_views FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: lct_exam_students Students can view their own lct exam; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own lct exam" ON public.lct_exam_students FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: lct_exam_locks Students can view their own lock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own lock" ON public.lct_exam_locks FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: parent_invite_codes Students can view their own parent code; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own parent code" ON public.parent_invite_codes FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: assignment_submissions Students can view their own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own submissions" ON public.assignment_submissions FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: report_cards Students can view their report cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their report cards" ON public.report_cards FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: weekly_plans Students can view weekly plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view weekly plans" ON public.weekly_plans FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = weekly_plans.school_id) AND (p.is_active = true) AND ((weekly_plans.grade_level = 'All Grades'::text) OR (p.grade_level = weekly_plans.grade_level))))));


--

--
-- Name: lesson_sessions Students manage own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students manage own sessions" ON public.lesson_sessions TO authenticated USING ((student_id = auth.uid())) WITH CHECK (((student_id = auth.uid()) AND (school_id = public.get_user_school_id(auth.uid()))));


--

--
-- Name: ability_estimates Students read own ability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own ability" ON public.ability_estimates FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: bandit_decisions Students read own bandit decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own bandit decisions" ON public.bandit_decisions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: bandit_arm_state Students read own bandit state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own bandit state" ON public.bandit_arm_state FOR SELECT TO authenticated USING (((scope = 'user'::text) AND (user_id = auth.uid())));


--

--
-- Name: lesson_explanations Students read own explanations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own explanations" ON public.lesson_explanations FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: ensemble_fit_runs Students read own fit runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own fit runs" ON public.ensemble_fit_runs FOR SELECT TO authenticated USING (((scope = 'user'::text) AND (user_id = auth.uid())));


--

--
-- Name: graded_events Students read own graded events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own graded events" ON public.graded_events FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: ensemble_predictions Students read own predictions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own predictions" ON public.ensemble_predictions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: policy_regret_log Students read own regret log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own regret log" ON public.policy_regret_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: lesson_events Students read visible lesson events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read visible lesson events" ON public.lesson_events FOR SELECT TO authenticated USING (((teacher_visible = true) AND (school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'student'::text))))));


--

--
-- Name: live_meetings Students view meetings for their grade; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students view meetings for their grade" ON public.live_meetings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = live_meetings.school_id) AND (p.grade_level = live_meetings.grade_level)))));


--

--
-- Name: ministry_ip_bans Super admin can manage IP bans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage IP bans" ON public.ministry_ip_bans USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: profiles Super admin can manage all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage all profiles" ON public.profiles USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: schools Super admin can manage all schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage all schools" ON public.schools USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: ministry_access_requests Super admin can manage ministry requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage ministry requests" ON public.ministry_access_requests USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: ministry_sessions Super admin can manage ministry sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage ministry sessions" ON public.ministry_sessions USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: moderator_invite_codes Super admin can manage moderator codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage moderator codes" ON public.moderator_invite_codes USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: moderator_requests Super admin can manage moderator requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage moderator requests" ON public.moderator_requests USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: weekly_plans Super admin can manage weekly plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage weekly plans" ON public.weekly_plans USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: mi_educational_events Super admin can read all mi events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can read all mi events" ON public.mi_educational_events FOR SELECT TO authenticated USING (public.is_super_admin_caller());


--

--
-- Name: ale_api_usage Super admin can view ALE api usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view ALE api usage" ON public.ale_api_usage FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));


--

--
-- Name: activity_logs Super admin can view all activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all activity logs" ON public.activity_logs FOR SELECT USING (public.is_super_admin());


--

--
-- Name: assignments Super admin can view all assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all assignments" ON public.assignments FOR SELECT USING (public.is_super_admin());


--

--
-- Name: course_materials Super admin can view all course materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all course materials" ON public.course_materials FOR SELECT USING (public.is_super_admin());


--

--
-- Name: student_learning_profiles Super admin can view all learning profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all learning profiles" ON public.student_learning_profiles FOR SELECT USING (public.is_super_admin());


--

--
-- Name: learning_style_profiles Super admin can view all learning style profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all learning style profiles" ON public.learning_style_profiles FOR SELECT USING (public.is_super_admin());


--

--
-- Name: profiles Super admin can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all profiles" ON public.profiles FOR SELECT USING (public.is_super_admin());


--

--
-- Name: submissions Super admin can view all submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all submissions" ON public.submissions FOR SELECT USING (public.is_super_admin());


--

--
-- Name: lct_exam_locks Super admin full access lct_exam_locks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin full access lct_exam_locks" ON public.lct_exam_locks USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: lct_exam_schools Super admin full access lct_exam_schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin full access lct_exam_schools" ON public.lct_exam_schools USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: lct_exam_students Super admin full access lct_exam_students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin full access lct_exam_students" ON public.lct_exam_students USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: lct_exams Super admin full access lct_exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin full access lct_exams" ON public.lct_exams USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: tenant_roles Super admin manages tenant roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manages tenant roles" ON public.tenant_roles TO authenticated USING (public.is_super_admin_user(auth.uid())) WITH CHECK (public.is_super_admin_user(auth.uid()));


--

--
-- Name: tenants Super admin manages tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manages tenants" ON public.tenants TO authenticated USING (public.is_super_admin_user(auth.uid())) WITH CHECK (public.is_super_admin_user(auth.uid()));


--

--
-- Name: mi_insights Super admin reads insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin reads insights" ON public.mi_insights FOR SELECT TO authenticated USING (public.is_super_admin_caller());


--

--
-- Name: item_parameter_history Super admin reads item parameter history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin reads item parameter history" ON public.item_parameter_history FOR SELECT TO authenticated USING (public.is_super_admin());


--

--
-- Name: mi_daily_rollups Super admin reads rollups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin reads rollups" ON public.mi_daily_rollups FOR SELECT TO authenticated USING (public.is_super_admin_caller());


--

--
-- Name: lumina_api_usage Super admin views usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin views usage" ON public.lumina_api_usage FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Canonical replacement for historical policy: schools Super admins can insert schools
--

CREATE POLICY "Super Admin can insert schools" ON public.schools FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

--
-- Canonical replacement for historical policy: school_admins Super admins can manage school admins
--

CREATE POLICY "Super Admin can manage School Admin memberships" ON public.school_admins TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

--
-- Name: activity_logs System can insert activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert activity logs" ON public.activity_logs FOR INSERT WITH CHECK ((user_id = auth.uid()));


--

--
-- Canonical replacement for historical policy: chat_rooms Teachers and admins can create chat rooms
--

CREATE POLICY "Teachers and School Admin can create school chat rooms" ON public.chat_rooms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.is_school_admin_of(auth.uid(), chat_rooms.school_id) OR public.is_super_admin());

--
-- Name: assignments Teachers can create assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can create assignments" ON public.assignments FOR INSERT TO authenticated WITH CHECK (((auth.uid() = teacher_id) AND (public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.is_teacher(auth.uid()))));


--

--
-- Name: course_materials Teachers can delete own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete own materials" ON public.course_materials FOR DELETE USING (((uploaded_by = auth.uid()) AND public.is_teacher(auth.uid())));


--

--
-- Canonical replacement for historical policy: assignments Teachers can delete their assignments
--

CREATE POLICY "Teachers and School Admin can delete school assignments" ON public.assignments FOR DELETE TO authenticated USING (teacher_id = auth.uid() OR public.is_school_admin_of(auth.uid(), assignments.school_id) OR public.is_super_admin());

--
-- Name: course_materials Teachers can delete their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete their own materials" ON public.course_materials FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'teacher'::public.app_role) AND (uploaded_by = auth.uid())));


--

--
-- Name: assignment_submissions Teachers can grade submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can grade submissions" ON public.assignment_submissions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.assignments
  WHERE ((assignments.id = assignment_submissions.assignment_id) AND (assignments.teacher_id = auth.uid())))));


--

--
-- Name: course_materials Teachers can insert course materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can insert course materials" ON public.course_materials FOR INSERT TO authenticated WITH CHECK (((auth.uid() = uploaded_by) AND public.is_teacher(auth.uid())));


--

--
-- Name: attendance Teachers can manage attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage attendance" ON public.attendance USING ((teacher_id = auth.uid()));


--

--
-- Name: awards Teachers can manage awards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage awards" ON public.awards USING ((teacher_id = auth.uid()));


--

--
-- Name: report_cards Teachers can manage report cards in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage report cards in their school" ON public.report_cards USING (((school_id = public.get_user_school_id(auth.uid())) AND public.is_teacher(auth.uid())));


--

--
-- Name: exams Teachers can manage their exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage their exams" ON public.exams USING ((teacher_id = auth.uid()));


--

--
-- Name: lesson_plans Teachers can manage their lesson plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage their lesson plans" ON public.lesson_plans USING ((teacher_id = auth.uid()));


--

--
-- Name: course_materials Teachers can update own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update own materials" ON public.course_materials FOR UPDATE USING (((uploaded_by = auth.uid()) AND public.is_teacher(auth.uid())));


--

--
-- Name: assignments Teachers can update their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update their assignments" ON public.assignments FOR UPDATE USING ((teacher_id = auth.uid()));


--

--
-- Name: course_materials Teachers can update their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update their own materials" ON public.course_materials FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'teacher'::public.app_role) AND (uploaded_by = auth.uid())));


--

--
-- Name: submissions Teachers can view and grade submissions for their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view and grade submissions for their assignments" ON public.submissions USING ((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = submissions.assignment_id) AND (a.teacher_id = auth.uid())))));


--

--
-- Name: assignment_views Teachers can view assignment views for their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view assignment views for their assignments" ON public.assignment_views FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = assignment_views.assignment_id) AND (a.teacher_id = auth.uid())))));


--

--
-- Name: exam_submissions Teachers can view exam submissions for their exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view exam submissions for their exams" ON public.exam_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.exams e
  WHERE ((e.id = exam_submissions.exam_id) AND (e.teacher_id = auth.uid())))));


--

--
-- Name: profiles Teachers can view profiles in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view profiles in their school" ON public.profiles FOR SELECT USING (((school_id = public.get_user_school_id(auth.uid())) AND public.is_teacher(auth.uid())));


--

--
-- Name: student_learning_profiles Teachers can view student learning profiles in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view student learning profiles in their school" ON public.student_learning_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.profiles teacher_p
     JOIN public.profiles student_p ON ((student_p.id = student_learning_profiles.user_id)))
  WHERE ((teacher_p.id = auth.uid()) AND (teacher_p.user_type = 'teacher'::text) AND (teacher_p.is_active = true) AND (student_p.school_id = teacher_p.school_id)))));


--

--
-- Name: assignment_submissions Teachers can view submissions for their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view submissions for their assignments" ON public.assignment_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.assignments
  WHERE ((assignments.id = assignment_submissions.assignment_id) AND (assignments.teacher_id = auth.uid())))));


--

--
-- Name: teacher_subjects Teachers can view their subjects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view their subjects" ON public.teacher_subjects FOR SELECT USING ((teacher_id = auth.uid()));


--

--
-- Name: weekly_plans Teachers can view weekly plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view weekly plans" ON public.weekly_plans FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = weekly_plans.school_id) AND (p.user_type = 'teacher'::text) AND (p.is_active = true)))));


--

--
-- Name: lesson_events Teachers insert events into own meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers insert events into own meetings" ON public.lesson_events FOR INSERT TO authenticated WITH CHECK (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.live_meetings m
  WHERE ((m.lesson_id = lesson_events.lesson_id) AND (m.teacher_id = auth.uid()) AND (m.school_id = lesson_events.school_id))))));


--

--
-- Name: lesson_events Teachers insert own lesson events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers insert own lesson events" ON public.lesson_events FOR INSERT TO authenticated WITH CHECK (((teacher_id = auth.uid()) AND (school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])))))));


--

--
-- Name: live_meetings Teachers manage own live meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers manage own live meetings" ON public.live_meetings TO authenticated USING (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = live_meetings.school_id)))))) WITH CHECK (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = live_meetings.school_id))))));


--

--
-- Name: curriculum_standards Tenant boundary on curriculum_standards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on curriculum_standards" ON public.curriculum_standards AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: curriculum_versions Tenant boundary on curriculum_versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on curriculum_versions" ON public.curriculum_versions AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: lct_exam_locks Tenant boundary on lct_exam_locks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on lct_exam_locks" ON public.lct_exam_locks AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: lct_exam_students Tenant boundary on lct_exam_students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on lct_exam_students" ON public.lct_exam_students AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: lct_exams Tenant boundary on lct_exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on lct_exams" ON public.lct_exams AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: schools Tenant boundary on schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on schools" ON public.schools AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: tenant_roles Tenant role holders read their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant role holders read their assignments" ON public.tenant_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: invite_requests Users can create invite requests with valid code; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create invite requests with valid code" ON public.invite_requests FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.invite_codes ic
  WHERE ((ic.id = invite_requests.code_id) AND (ic.used = false) AND (ic.expires_at > now())))));


--

--
-- Name: messages Users can create messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create messages in their conversations" ON public.messages FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = messages.conversation_id) AND (conversations.user_id = auth.uid())))));


--

--
-- Name: conversations Users can create their own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own conversations" ON public.conversations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: student_goals Users can create their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own goals" ON public.student_goals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: materials Users can create their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own materials" ON public.materials FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: notes Users can create their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own notes" ON public.notes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: teacher_requests Users can create their own request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own request" ON public.teacher_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: messages Users can delete messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete messages in their conversations" ON public.messages FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = messages.conversation_id) AND (conversations.user_id = auth.uid())))));


--

--
-- Name: knowledge_gaps Users can delete own gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own gaps" ON public.knowledge_gaps FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: student_memory Users can delete own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own memories" ON public.student_memory FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: material_comments Users can delete their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own comments" ON public.material_comments FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: conversations Users can delete their own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own conversations" ON public.conversations FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Name: student_goals Users can delete their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own goals" ON public.student_goals FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Name: materials Users can delete their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own materials" ON public.materials FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Canonical replacement for historical policy: chat_messages Users can delete their own messages
--

CREATE POLICY "Users and School Admin can delete school messages" ON public.chat_messages FOR DELETE TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.chat_rooms cr WHERE cr.id = chat_messages.room_id AND public.is_school_admin_of(auth.uid(), cr.school_id)) OR public.is_super_admin());

--
-- Name: notes Users can delete their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notes" ON public.notes FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Name: knowledge_gaps Users can insert own gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own gaps" ON public.knowledge_gaps FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: student_memory Users can insert own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own memories" ON public.student_memory FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--

--
-- Name: iq_test_results Users can insert their own IQ results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own IQ results" ON public.iq_test_results FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: user_activity_log Users can insert their own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own activity" ON public.user_activity_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: student_answer_history Users can insert their own answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own answers" ON public.student_answer_history FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: material_comments Users can insert their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own comments" ON public.material_comments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: student_learning_profiles Users can insert their own learning profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own learning profile" ON public.student_learning_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: learning_style_profiles Users can insert their own learning style; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own learning style" ON public.learning_style_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: podcast_generations Users can insert their own podcast generations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own podcast generations" ON public.podcast_generations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: announcement_reads Users can insert their own reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own reads" ON public.announcement_reads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: daily_streaks Users can insert their own streak; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own streak" ON public.daily_streaks FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: trip_reads Users can insert their own trip reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own trip reads" ON public.trip_reads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: material_views Users can insert their own views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own views" ON public.material_views FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: knowledge_gaps Users can update own gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own gaps" ON public.knowledge_gaps FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: student_memory Users can update own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own memories" ON public.student_memory FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--

--
-- Name: conversations Users can update their own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own conversations" ON public.conversations FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: student_goals Users can update their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own goals" ON public.student_goals FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: student_learning_profiles Users can update their own learning profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own learning profile" ON public.student_learning_profiles FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: learning_style_profiles Users can update their own learning style; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own learning style" ON public.learning_style_profiles FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: materials Users can update their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own materials" ON public.materials FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: notes Users can update their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notes" ON public.notes FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: daily_streaks Users can update their own streak; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own streak" ON public.daily_streaks FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: announcements Users can view announcements in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view announcements in their school" ON public.announcements FOR SELECT USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: assignments Users can view assignments in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view assignments in their school" ON public.assignments FOR SELECT USING ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text)))));


--

--
-- Name: chat_rooms Users can view chat rooms in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view chat rooms in their school" ON public.chat_rooms FOR SELECT USING ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text)))));


--

--
-- Name: classes Users can view classes in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view classes in their school" ON public.classes FOR SELECT USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: course_materials Users can view materials from their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view materials from their school" ON public.course_materials FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));


--

--
-- Name: messages Users can view messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = messages.conversation_id) AND (conversations.user_id = auth.uid())))));


--

--
-- Name: chat_messages Users can view messages in their school chat rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their school chat rooms" ON public.chat_messages FOR SELECT USING ((chat_room_id IN ( SELECT cr.id
   FROM (public.chat_rooms cr
     JOIN public.profiles p ON ((p.school_id = cr.school_id)))
  WHERE ((p.id = auth.uid()) AND (p.status = 'approved'::text)))));


--

--
-- Name: moderation_actions Users can view own actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own actions" ON public.moderation_actions FOR SELECT USING ((target_user_id = auth.uid()));


--

--
-- Name: knowledge_gaps Users can view own gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own gaps" ON public.knowledge_gaps FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: student_memory Users can view own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own memories" ON public.student_memory FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Canonical immutable-identity replacement: moderator_requests Users can view own moderator request by email
--

CREATE POLICY "Users can view own moderator request" ON public.moderator_requests FOR SELECT TO authenticated USING (user_id = auth.uid());

--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--

--
-- Canonical immutable-identity replacement: profiles Users can view own profile by email
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

--
-- Name: subjects Users can view subjects in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view subjects in their school" ON public.subjects FOR SELECT USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: iq_test_results Users can view their own IQ results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own IQ results" ON public.iq_test_results FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: activity_logs Users can view their own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own activity" ON public.activity_logs FOR SELECT USING ((user_id = auth.uid()));


--

--
-- Name: user_activity_log Users can view their own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own activity" ON public.user_activity_log FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: student_answer_history Users can view their own answer history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own answer history" ON public.student_answer_history FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: conversations Users can view their own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own conversations" ON public.conversations FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: student_goals Users can view their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own goals" ON public.student_goals FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: student_learning_profiles Users can view their own learning profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own learning profile" ON public.student_learning_profiles FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: learning_style_profiles Users can view their own learning style; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own learning style" ON public.learning_style_profiles FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: material_views Users can view their own material views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own material views" ON public.material_views FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: materials Users can view their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own materials" ON public.materials FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: notes Users can view their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notes" ON public.notes FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: podcast_generations Users can view their own podcast generations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own podcast generations" ON public.podcast_generations FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: announcement_reads Users can view their own reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own reads" ON public.announcement_reads FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: teacher_requests Users can view their own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own requests" ON public.teacher_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: schools Users can view their own school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own school" ON public.schools FOR SELECT TO authenticated USING ((id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text)))));


--

--
-- Name: daily_streaks Users can view their own streak; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own streak" ON public.daily_streaks FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: user_strikes Users can view their own strikes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own strikes" ON public.user_strikes FOR SELECT USING ((user_id = auth.uid()));


--

--
-- Name: trip_reads Users can view their own trip reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own trip reads" ON public.trip_reads FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: school_admins Users can view their school admin status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their school admin status" ON public.school_admins FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: course_materials Users can view their school materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their school materials" ON public.course_materials FOR SELECT TO authenticated USING ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text)))));


--

--
-- Name: trips Users can view trips in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view trips in their school" ON public.trips FOR SELECT USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: saved_lectures Users create own saved lectures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users create own saved lectures" ON public.saved_lectures FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: saved_lectures Users delete own saved lectures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own saved lectures" ON public.saved_lectures FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: mind_map_history Users manage own mind maps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own mind maps" ON public.mind_map_history TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: kt_sequence_state Users read own kt state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own kt state" ON public.kt_sequence_state FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: ensemble_weights Users read own or population weights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own or population weights" ON public.ensemble_weights FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (user_id IS NULL)));


--

--
-- Name: saved_lectures Users update own saved lectures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own saved lectures" ON public.saved_lectures FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: saved_lectures Users view own saved lectures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own saved lectures" ON public.saved_lectures FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: moderator_requests Validated moderator signup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Validated moderator signup" ON public.moderator_requests FOR INSERT TO authenticated, anon WITH CHECK ((EXISTS ( SELECT 1
   FROM public.moderator_invite_codes
  WHERE ((moderator_invite_codes.id = moderator_requests.code_id) AND (moderator_invite_codes.used = false) AND (moderator_invite_codes.expires_at > now())))));


--

--
-- Name: ability_estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ability_estimates ENABLE ROW LEVEL SECURITY;

--

--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: adaptive_quality_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.adaptive_quality_scores ENABLE ROW LEVEL SECURITY;

--

--
-- Name: data_export_requests admin/teacher request exports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin/teacher request exports" ON public.data_export_requests FOR INSERT TO authenticated WITH CHECK (((requested_by = auth.uid()) AND (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR public.has_role(auth.uid(), 'teacher'::public.app_role) OR ((scope = 'student'::text) AND (target_id = auth.uid())))));


--

--
-- Name: admin_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

--

--
-- Canonical replacement for historical policy: model_evaluation_metrics admins read eval metrics
--

CREATE POLICY "Super Admin reads evaluation metrics" ON public.model_evaluation_metrics FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: model_evaluation_runs admins read eval runs
--

CREATE POLICY "Super Admin reads evaluation runs" ON public.model_evaluation_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Name: governance_audit_trail admins read own school audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read own school audit" ON public.governance_audit_trail FOR SELECT TO authenticated USING (((school_id IS NULL) OR public.is_school_admin_of(auth.uid(), school_id) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: pilot_assignments admins write pilot assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins write pilot assignments" ON public.pilot_assignments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pilot_studies p
  WHERE ((p.id = pilot_assignments.pilot_id) AND ((p.school_id IS NULL) OR public.is_school_admin_of(auth.uid(), p.school_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pilot_studies p
  WHERE ((p.id = pilot_assignments.pilot_id) AND ((p.school_id IS NULL) OR public.is_school_admin_of(auth.uid(), p.school_id))))));


--

--
-- Name: ai_output_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_output_signals ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ale_api_students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ale_api_students ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ale_api_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ale_api_usage ENABLE ROW LEVEL SECURITY;

--

--
-- Name: anchor_recalibrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anchor_recalibrations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: announcement_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

--

--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--

--
-- Name: governance_audit_trail any authenticated may append own audit row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "any authenticated may append own audit row" ON public.governance_audit_trail FOR INSERT TO authenticated WITH CHECK (((actor_id = auth.uid()) OR (actor_id IS NULL)));


--

--
-- Name: assessment_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessment_scores ENABLE ROW LEVEL SECURITY;

--

--
-- Name: assignment_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: assignment_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignment_views ENABLE ROW LEVEL SECURITY;

--

--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--

--
-- Name: symbolic_alignment_matrices auth reads alignment matrices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth reads alignment matrices" ON public.symbolic_alignment_matrices FOR SELECT TO authenticated USING (true);


--

--
-- Name: unified_objective_runs auth reads objective runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth reads objective runs" ON public.unified_objective_runs FOR SELECT TO authenticated USING (true);


--

--
-- Name: unified_policy_weights auth reads policy weights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth reads policy weights" ON public.unified_policy_weights FOR SELECT TO authenticated USING (true);


--

--
-- Name: awards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;

--

--
-- Name: bandit_arm_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bandit_arm_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: bandit_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bandit_decisions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: calibration_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calibration_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--

--
-- Name: chat_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

--

--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: cognitive_mirror_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cognitive_mirror_snapshots ENABLE ROW LEVEL SECURITY;

--

--
-- Name: cognitive_mirror_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cognitive_mirror_stats ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concept_mastery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concept_mastery ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concept_standard_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concept_standard_map ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concepts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concepts concepts_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY concepts_select_same_school ON public.concepts FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: concepts concepts_write_school_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY concepts_write_school_staff ON public.concepts TO authenticated USING ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid()))))) WITH CHECK ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid())))));


--

--
-- Name: confidence_calibration_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.confidence_calibration_stats ENABLE ROW LEVEL SECURITY;

--

--
-- Name: confidence_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.confidence_responses ENABLE ROW LEVEL SECURITY;

--

--
-- Name: content_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_flags ENABLE ROW LEVEL SECURITY;

--

--
-- Name: continuous_validation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.continuous_validation_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: course_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

--

--
-- Name: curriculum_standards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.curriculum_standards ENABLE ROW LEVEL SECURITY;

--

--
-- Name: curriculum_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.curriculum_versions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: curriculum_versions curriculum_versions_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY curriculum_versions_select_same_school ON public.curriculum_versions FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: curriculum_versions curriculum_versions_write_school_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY curriculum_versions_write_school_admin ON public.curriculum_versions TO authenticated USING ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND public.is_school_admin_of(auth.uid(), school_id)))) WITH CHECK ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: daily_streaks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_streaks ENABLE ROW LEVEL SECURITY;

--

--
-- Name: data_export_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: decay_refreshers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.decay_refreshers ENABLE ROW LEVEL SECURITY;

--

--
-- Name: engine_drift_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_drift_alerts ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ensemble_fit_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ensemble_fit_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ensemble_predictions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ensemble_predictions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ensemble_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ensemble_weights ENABLE ROW LEVEL SECURITY;

--

--
-- Name: exam_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_audit_chats ext_audit super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_audit super admin read" ON public.extension_audit_chats FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_blueprints ext_bp super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_bp super admin read" ON public.extension_blueprints FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_conversations ext_conv super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_conv super admin read" ON public.extension_conversations FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_data ext_data owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_data owner delete" ON public.extension_data FOR DELETE TO authenticated USING ((owner_user_id = auth.uid()));


--

--
-- Name: extension_data ext_data owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_data owner update" ON public.extension_data FOR UPDATE TO authenticated USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));


--

--
-- Name: extension_data ext_data tenant insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_data tenant insert" ON public.extension_data FOR INSERT TO authenticated WITH CHECK (((tenant_id IN ( SELECT s.tenant_id
   FROM (public.schools s
     JOIN public.profiles p ON ((p.school_id = s.id)))
  WHERE (p.id = auth.uid()))) AND ((owner_user_id IS NULL) OR (owner_user_id = auth.uid()))));


--

--
-- Name: extension_data ext_data tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_data tenant read" ON public.extension_data FOR SELECT TO authenticated USING ((public.is_super_admin_caller() OR (tenant_id IN ( SELECT s.tenant_id
   FROM (public.schools s
     JOIN public.profiles p ON ((p.school_id = s.id)))
  WHERE (p.id = auth.uid())))));


--

--
-- Name: extension_messages ext_msg super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_msg super admin read" ON public.extension_messages FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_requests ext_req super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_req super admin read" ON public.extension_requests FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_sandbox_data ext_sandbox super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_sandbox super admin read" ON public.extension_sandbox_data FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_versions ext_ver active read for tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_ver active read for tenant" ON public.extension_versions FOR SELECT USING (((active = true) AND (public.is_super_admin_caller() OR (tenant_id IN ( SELECT s.tenant_id
   FROM (public.schools s
     JOIN public.profiles p ON ((p.school_id = s.id)))
  WHERE (p.id = auth.uid()))))));


--

--
-- Name: extension_audit_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_audit_chats ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_blueprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_blueprints ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_conversations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_data ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_messages ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_sandbox_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_sandbox_data ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_versions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: fsrs_card_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fsrs_card_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: fsrs_card_state fsrs_card_state self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fsrs_card_state self read" ON public.fsrs_card_state FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: governance_audit_trail; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.governance_audit_trail ENABLE ROW LEVEL SECURITY;

--

--
-- Name: graded_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.graded_events ENABLE ROW LEVEL SECURITY;

--

--
-- Name: hyperparameter_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hyperparameter_settings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: hyperparameter_tuning_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hyperparameter_tuning_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concept_standard_map in-school read of mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "in-school read of mappings" ON public.concept_standard_map FOR SELECT TO authenticated USING (((school_id IS NULL) OR (school_id = public.get_user_school_id(auth.uid()))));


--

--
-- Name: topic_locks in-school topic lock management; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "in-school topic lock management" ON public.topic_locks TO authenticated USING ((public.is_school_admin_of(auth.uid(), school_id) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid()))))) WITH CHECK ((public.is_school_admin_of(auth.uid(), school_id) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid())) AND (teacher_id = auth.uid()))));


--

--
-- Name: invite_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: invite_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: iq_test_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iq_test_results ENABLE ROW LEVEL SECURITY;

--

--
-- Name: item_parameter_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_parameter_history ENABLE ROW LEVEL SECURITY;

--

--
-- Name: knowledge_gaps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;

--

--
-- Name: kt_sequence_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kt_sequence_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lct_exam_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lct_exam_locks ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lct_exam_schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lct_exam_schools ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lct_exam_students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lct_exam_students ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lct_exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lct_exams ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_mode_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_mode_sessions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_objectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_objectives ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_outcomes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_style_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_style_profiles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lectures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lectures lectures_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectures_select_same_school ON public.lectures FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: lectures lectures_write_school_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectures_write_school_staff ON public.lectures TO authenticated USING ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid()))))) WITH CHECK ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid())))));


--

--
-- Name: lesson_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_events ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_explanations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_explanations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_objective_bindings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_objective_bindings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_sessions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_state_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_state_snapshots ENABLE ROW LEVEL SECURITY;

--

--
-- Name: live_meetings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_meetings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lumina_api_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lumina_api_usage ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lumina_cost_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lumina_cost_ledger ENABLE ROW LEVEL SECURITY;

--

--
-- Name: material_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_comments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: material_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_views ENABLE ROW LEVEL SECURITY;

--

--
-- Name: materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_curriculum_subjects mc_cs super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_cs super admin write" ON public.mc_curriculum_subjects USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_curriculum_subjects mc_cs tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_cs tenant read" ON public.mc_curriculum_subjects FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_curriculum_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_curriculum_subjects ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_curriculum_version_defs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_curriculum_version_defs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_curriculum_version_defs mc_cvd super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_cvd super admin write" ON public.mc_curriculum_version_defs USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_curriculum_version_defs mc_cvd tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_cvd tenant read" ON public.mc_curriculum_version_defs FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_educational_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_educational_policies ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_educational_policies mc_ep super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_ep super admin write" ON public.mc_educational_policies USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_educational_policies mc_ep tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_ep tenant read" ON public.mc_educational_policies FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_lumina_config mc_lc super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_lc super admin write" ON public.mc_lumina_config USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_lumina_config mc_lc tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_lc tenant read" ON public.mc_lumina_config FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_lumina_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_lumina_config ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_regions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_regions mc_regions super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_regions super admin write" ON public.mc_regions USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_regions mc_regions tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_regions tenant read" ON public.mc_regions FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_school_lifecycle_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_school_lifecycle_events ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_school_region_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_school_region_assignments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_school_lifecycle_events mc_sle insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_sle insert" ON public.mc_school_lifecycle_events FOR INSERT WITH CHECK (true);


--

--
-- Name: mc_school_lifecycle_events mc_sle tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_sle tenant read" ON public.mc_school_lifecycle_events FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_school_region_assignments mc_sra super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_sra super admin write" ON public.mc_school_region_assignments USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_school_region_assignments mc_sra tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_sra tenant read" ON public.mc_school_region_assignments FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mi_daily_rollups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mi_daily_rollups ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mi_educational_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mi_educational_events ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mi_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mi_insights ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mind_map_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mind_map_history ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_access_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_access_codes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_access_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_access_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_announcements ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_audit_log ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_capabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_capabilities ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_change_appliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_change_appliers ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_change_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_change_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_ip_bans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_ip_bans ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_role_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_role_assignments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_sessions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: misconception_embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.misconception_embeddings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: model_evaluation_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.model_evaluation_metrics ENABLE ROW LEVEL SECURITY;

--

--
-- Name: model_evaluation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.model_evaluation_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: moderation_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: moderator_invite_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderator_invite_codes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: moderator_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderator_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: morning_briefings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.morning_briefings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: note_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_snapshots ENABLE ROW LEVEL SECURITY;

--

--
-- Name: note_timeline_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_timeline_summaries ENABLE ROW LEVEL SECURITY;

--

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_objectives objectives follow parent standard; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "objectives follow parent standard" ON public.learning_objectives FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.curriculum_standards cs
  WHERE ((cs.id = learning_objectives.standard_id) AND ((cs.school_id IS NULL) OR (cs.school_id = public.get_user_school_id(auth.uid())))))));


--

--
-- Name: learning_outcomes outcome read scoping; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outcome read scoping" ON public.learning_outcomes FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR ((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR public.can_view_student_mastery(auth.uid(), student_id)));


--

--
-- Name: parent_invite_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parent_invite_codes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: parent_students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;

--

--
-- Name: confidence_calibration_stats parents read child calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parents read child calibration" ON public.confidence_calibration_stats FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: confidence_responses parents read child confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parents read child confidence" ON public.confidence_responses FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: learning_mode_sessions parents read child learning sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parents read child learning sessions" ON public.learning_mode_sessions FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: concept_mastery parents read child mastery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parents read child mastery" ON public.concept_mastery FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: pilot_assignments pilot assignments visible to admins or student; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pilot assignments visible to admins or student" ON public.pilot_assignments FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.pilot_studies p
  WHERE ((p.id = pilot_assignments.pilot_id) AND ((p.school_id IS NULL) OR public.is_school_admin_of(auth.uid(), p.school_id)))))));


--

--
-- Name: pilot_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pilot_assignments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: pilot_studies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pilot_studies ENABLE ROW LEVEL SECURITY;

--

--
-- Name: podcast_generations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.podcast_generations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: policy_evaluation_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_evaluation_results ENABLE ROW LEVEL SECURITY;

--

--
-- Name: policy_evaluation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_evaluation_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: policy_regret_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_regret_log ENABLE ROW LEVEL SECURITY;

--

--
-- Name: population_prior_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.population_prior_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: population_priors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.population_priors ENABLE ROW LEVEL SECURITY;

--

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: question_bank; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

--

--
-- Name: tenant_feature_flags read own tenant flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own tenant flags" ON public.tenant_feature_flags FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: ministry_announcements read own tenant ministry announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own tenant ministry announcements" ON public.ministry_announcements FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR ((published = true) AND (tenant_id = public.get_user_tenant_id(auth.uid())))));


--

--
-- Name: recall_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recall_schedule ENABLE ROW LEVEL SECURITY;

--

--
-- Name: report_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;

--

--
-- Name: data_export_requests requester reads own exports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "requester reads own exports" ON public.data_export_requests FOR SELECT TO authenticated USING (((requested_by = auth.uid()) OR ((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: saved_lectures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_lectures ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concept_standard_map school admins manage mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins manage mappings" ON public.concept_standard_map TO authenticated USING (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id))) WITH CHECK (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: learning_objectives school admins manage objectives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins manage objectives" ON public.learning_objectives TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.curriculum_standards cs
  WHERE ((cs.id = learning_objectives.standard_id) AND (cs.school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), cs.school_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.curriculum_standards cs
  WHERE ((cs.id = learning_objectives.standard_id) AND (cs.school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), cs.school_id)))));


--

--
-- Name: pilot_studies school admins manage pilots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins manage pilots" ON public.pilot_studies TO authenticated USING (((school_id IS NULL) OR public.is_school_admin_of(auth.uid(), school_id))) WITH CHECK (((school_id IS NULL) OR public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: curriculum_standards school admins manage standards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins manage standards" ON public.curriculum_standards TO authenticated USING (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id))) WITH CHECK (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: lumina_cost_ledger school admins view school usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins view school usage" ON public.lumina_cost_ledger FOR SELECT TO authenticated USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: morning_briefings school staff read same-school briefings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school briefings" ON public.morning_briefings FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: confidence_calibration_stats school staff read same-school calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school calibration" ON public.confidence_calibration_stats FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: confidence_responses school staff read same-school confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school confidence" ON public.confidence_responses FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: learning_mode_sessions school staff read same-school learning sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school learning sessions" ON public.learning_mode_sessions FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: concept_mastery school staff read same-school mastery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school mastery" ON public.concept_mastery FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: cognitive_mirror_snapshots school staff read same-school snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school snapshots" ON public.cognitive_mirror_snapshots FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: cognitive_mirror_stats school staff read same-school stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school stats" ON public.cognitive_mirror_stats FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: adaptive_quality_scores school staff view scores in school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff view scores in school" ON public.adaptive_quality_scores FOR SELECT USING (((school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = adaptive_quality_scores.school_id) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (p.is_active = true))))));


--

--
-- Name: ai_output_signals school staff view signals in school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff view signals in school" ON public.ai_output_signals FOR SELECT USING (((school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = ai_output_signals.school_id) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (p.is_active = true))))));


--

--
-- Name: school_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;

--

--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--

--
-- Name: misconception_embeddings self read misconceptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self read misconceptions" ON public.misconception_embeddings FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: unified_policy_decisions self read policy decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self read policy decisions" ON public.unified_policy_decisions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: unified_student_state self read unified state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self read unified state" ON public.unified_student_state FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: unified_student_state service inserts unified state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service inserts unified state" ON public.unified_student_state FOR INSERT TO service_role WITH CHECK (true);


--

--
-- Name: misconception_embeddings service writes misconceptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service writes misconceptions" ON public.misconception_embeddings TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: unified_policy_decisions service writes policy decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service writes policy decisions" ON public.unified_policy_decisions TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: model_evaluation_metrics service_role manages eval metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role manages eval metrics" ON public.model_evaluation_metrics TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: model_evaluation_runs service_role manages eval runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role manages eval runs" ON public.model_evaluation_runs TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: curriculum_standards standards readable in-school or global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "standards readable in-school or global" ON public.curriculum_standards FOR SELECT TO authenticated, anon USING (((school_id IS NULL) OR (school_id = public.get_user_school_id(auth.uid()))));


--

--
-- Name: lesson_objective_bindings student or in-school read of bindings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "student or in-school read of bindings" ON public.lesson_objective_bindings FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR ((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR public.can_view_student_mastery(auth.uid(), student_id)));


--

--
-- Name: student_answer_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_answer_history ENABLE ROW LEVEL SECURITY;

--

--
-- Name: student_classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_classes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: student_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_goals ENABLE ROW LEVEL SECURITY;

--

--
-- Name: student_learning_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_learning_profiles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: student_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_memory ENABLE ROW LEVEL SECURITY;

--

--
-- Name: note_snapshots students delete own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students delete own snapshots" ON public.note_snapshots FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Name: confidence_responses students insert own confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students insert own confidence" ON public.confidence_responses FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: note_snapshots students insert own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students insert own snapshots" ON public.note_snapshots FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: learning_mode_sessions students manage own learning sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students manage own learning sessions" ON public.learning_mode_sessions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: concept_mastery students manage own mastery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students manage own mastery" ON public.concept_mastery USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: decay_refreshers students manage own refreshers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students manage own refreshers" ON public.decay_refreshers USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: note_timeline_summaries students manage own timeline summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students manage own timeline summaries" ON public.note_timeline_summaries USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: morning_briefings students read own briefings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own briefings" ON public.morning_briefings FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: confidence_calibration_stats students read own calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own calibration" ON public.confidence_calibration_stats FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: confidence_responses students read own confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own confidence" ON public.confidence_responses FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: teacher_overrides students read own overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own overrides" ON public.teacher_overrides FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--

--
-- Name: recall_schedule students read own recall; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own recall" ON public.recall_schedule FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: assessment_scores students read own scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own scores" ON public.assessment_scores FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR ((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR public.can_view_student_mastery(auth.uid(), student_id)));


--

--
-- Name: cognitive_mirror_snapshots students read own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own snapshots" ON public.cognitive_mirror_snapshots FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: note_snapshots students read own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own snapshots" ON public.note_snapshots FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: cognitive_mirror_stats students read own stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own stats" ON public.cognitive_mirror_stats FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: topic_locks students see locks affecting them; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students see locks affecting them" ON public.topic_locks FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--

--
-- Name: morning_briefings students update own briefings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students update own briefings" ON public.morning_briefings FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: recall_schedule students update own recall; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students update own recall" ON public.recall_schedule FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: lumina_cost_ledger students view own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students view own usage" ON public.lumina_cost_ledger FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

--

--
-- Name: submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: confidence_calibration_stats super admin all calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all calibration" ON public.confidence_calibration_stats FOR SELECT USING (public.is_super_admin());


--

--
-- Name: confidence_responses super admin all confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all confidence" ON public.confidence_responses FOR SELECT USING (public.is_super_admin());


--

--
-- Name: learning_mode_sessions super admin all learning sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all learning sessions" ON public.learning_mode_sessions FOR SELECT USING (public.is_super_admin());


--

--
-- Name: concept_mastery super admin all mastery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all mastery" ON public.concept_mastery FOR SELECT USING (public.is_super_admin());


--

--
-- Name: decay_refreshers super admin all refreshers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all refreshers" ON public.decay_refreshers FOR SELECT USING (public.is_super_admin());


--

--
-- Name: note_snapshots super admin all snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all snapshots" ON public.note_snapshots FOR SELECT USING (public.is_super_admin());


--

--
-- Name: ministry_announcements super admin authors ministry announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin authors ministry announcements" ON public.ministry_announcements TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--

--
-- Name: tenant_feature_flags super admin manages flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin manages flags" ON public.tenant_feature_flags TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--

--
-- Name: morning_briefings super admin reads all briefings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads all briefings" ON public.morning_briefings FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: recall_schedule super admin reads all recall; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads all recall" ON public.recall_schedule FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: cognitive_mirror_snapshots super admin reads all snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads all snapshots" ON public.cognitive_mirror_snapshots FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: cognitive_mirror_stats super admin reads all stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads all stats" ON public.cognitive_mirror_stats FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: anchor_recalibrations super admin reads anchor recalibrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads anchor recalibrations" ON public.anchor_recalibrations FOR SELECT TO authenticated USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: adaptive_quality_scores super admin views all quality scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin views all quality scores" ON public.adaptive_quality_scores FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: ai_output_signals super admin views all signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin views all signals" ON public.ai_output_signals FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: symbolic_alignment_matrices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.symbolic_alignment_matrices ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_categories ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_overrides ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_overrides teachers manage own school overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "teachers manage own school overrides" ON public.teacher_overrides TO authenticated USING ((public.is_school_admin_of(auth.uid(), school_id) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid()))))) WITH CHECK ((public.is_school_admin_of(auth.uid(), school_id) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid())) AND (teacher_id = auth.uid()))));


--

--
-- Name: assessment_scores teachers/admins record scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "teachers/admins record scores" ON public.assessment_scores FOR INSERT TO authenticated WITH CHECK ((((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid())))));


--

--
-- Name: tenant_feature_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

--

--
-- Name: tenant_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--

--
-- Name: topic_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topic_locks ENABLE ROW LEVEL SECURITY;

--

--
-- Name: trip_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_reads ENABLE ROW LEVEL SECURITY;

--

--
-- Name: trips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

--

--
-- Name: unified_objective_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_objective_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: unified_policy_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_policy_decisions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: unified_policy_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_policy_weights ENABLE ROW LEVEL SECURITY;

--

--
-- Name: unified_student_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_student_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: user_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

--

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: user_strikes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: adaptive_quality_scores users insert own quality scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own quality scores" ON public.adaptive_quality_scores FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: ai_output_signals users insert own signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own signals" ON public.ai_output_signals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: adaptive_quality_scores users view own quality scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users view own quality scores" ON public.adaptive_quality_scores FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: ai_output_signals users view own signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users view own signals" ON public.ai_output_signals FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: weekly_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--
