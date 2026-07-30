ALTER TABLE "sections" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "terms" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "homework" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "report_cards" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD COLUMN "school_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_memberships_school_id_idx" ON "school_memberships" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "school_memberships_user_id_idx" ON "school_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "academic_years_school_id_idx" ON "academic_years" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "grade_levels_school_id_idx" ON "grade_levels" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "sections_school_id_idx" ON "sections" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "sections_grade_level_id_idx" ON "sections" USING btree ("grade_level_id");--> statement-breakpoint
CREATE INDEX "sections_academic_year_id_idx" ON "sections" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "sections_homeroom_teacher_membership_id_idx" ON "sections" USING btree ("homeroom_teacher_membership_id");--> statement-breakpoint
CREATE INDEX "subjects_school_id_idx" ON "subjects" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "terms_school_id_idx" ON "terms" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "terms_academic_year_id_idx" ON "terms" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "guardians_school_id_idx" ON "guardians" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "guardians_user_id_idx" ON "guardians" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_guardians_school_id_idx" ON "student_guardians" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "student_guardians_student_id_idx" ON "student_guardians" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_guardians_guardian_id_idx" ON "student_guardians" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "students_school_id_idx" ON "students" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "students_user_id_idx" ON "students" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "students_section_id_idx" ON "students" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "teaching_assignments_school_id_idx" ON "teaching_assignments" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "teaching_assignments_teacher_membership_id_idx" ON "teaching_assignments" USING btree ("teacher_membership_id");--> statement-breakpoint
CREATE INDEX "teaching_assignments_section_id_idx" ON "teaching_assignments" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "teaching_assignments_subject_id_idx" ON "teaching_assignments" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "teaching_assignments_academic_year_id_idx" ON "teaching_assignments" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "announcement_reads_school_id_idx" ON "announcement_reads" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "announcement_reads_announcement_id_idx" ON "announcement_reads" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "announcement_reads_user_id_idx" ON "announcement_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "announcements_school_id_published_at_idx" ON "announcements" USING btree ("school_id","published_at");--> statement-breakpoint
CREATE INDEX "announcements_author_membership_id_idx" ON "announcements" USING btree ("author_membership_id");--> statement-breakpoint
CREATE INDEX "assessments_school_id_idx" ON "assessments" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "assessments_section_id_idx" ON "assessments" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "assessments_subject_id_idx" ON "assessments" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "assessments_term_id_idx" ON "assessments" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "attendance_records_school_id_idx" ON "attendance_records" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "attendance_records_student_id_date_idx" ON "attendance_records" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "attendance_records_marked_by_membership_id_idx" ON "attendance_records" USING btree ("marked_by_membership_id");--> statement-breakpoint
CREATE INDEX "audit_logs_school_id_idx" ON "audit_logs" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "homework_school_id_idx" ON "homework" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "homework_section_id_idx" ON "homework" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "homework_subject_id_idx" ON "homework" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "homework_teacher_membership_id_idx" ON "homework" USING btree ("teacher_membership_id");--> statement-breakpoint
CREATE INDEX "marks_school_id_idx" ON "marks" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "marks_assessment_id_idx" ON "marks" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "marks_student_id_idx" ON "marks" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "marks_entered_by_idx" ON "marks" USING btree ("entered_by");--> statement-breakpoint
CREATE INDEX "notifications_school_id_idx" ON "notifications" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_cards_school_id_idx" ON "report_cards" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "report_cards_student_id_idx" ON "report_cards" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "report_cards_term_id_idx" ON "report_cards" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "timetable_slots_school_id_idx" ON "timetable_slots" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "timetable_slots_section_id_idx" ON "timetable_slots" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "timetable_slots_subject_id_idx" ON "timetable_slots" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "timetable_slots_teacher_membership_id_idx" ON "timetable_slots" USING btree ("teacher_membership_id");--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_dates_sane" CHECK ("academic_years"."ends_on" > "academic_years"."starts_on");--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_dates_sane" CHECK ("terms"."ends_on" > "terms"."starts_on");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_dob_before_joined_on" CHECK ("students"."dob" < "students"."joined_on");--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_times_sane" CHECK ("timetable_slots"."ends_at" > "timetable_slots"."starts_at");