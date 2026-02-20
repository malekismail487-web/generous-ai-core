import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the calling user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's school
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("school_id, full_name")
      .eq("id", user.id)
      .single();

    if (!profile?.school_id) {
      return new Response(JSON.stringify({ error: "No school found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all students in the same school
    const { data: students } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("school_id", profile.school_id)
      .eq("user_type", "student")
      .eq("is_active", true)
      .eq("status", "approved");

    if (!students || students.length === 0) {
      return new Response(JSON.stringify({ leaderboard: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const studentIds = students.map(s => s.id);

    // Get streaks for all students
    const { data: streaks } = await supabaseAdmin
      .from("daily_streaks")
      .select("user_id, current_streak, max_streak")
      .in("user_id", studentIds);

    // Get learning profiles (total questions answered, correct answers)
    const { data: learningProfiles } = await supabaseAdmin
      .from("student_learning_profiles")
      .select("user_id, total_questions_answered, correct_answers")
      .in("user_id", studentIds);

    // Get completed goals count
    const { data: goals } = await supabaseAdmin
      .from("student_goals")
      .select("user_id, completed")
      .in("user_id", studentIds)
      .eq("completed", true);

    // Aggregate per student
    const studentMap = new Map<string, {
      id: string;
      name: string;
      streak: number;
      maxStreak: number;
      questionsAnswered: number;
      correctAnswers: number;
      goalsCompleted: number;
      score: number;
    }>();

    for (const s of students) {
      studentMap.set(s.id, {
        id: s.id,
        name: s.full_name,
        streak: 0,
        maxStreak: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        goalsCompleted: 0,
        score: 0,
      });
    }

    // Merge streaks
    for (const s of streaks || []) {
      const entry = studentMap.get(s.user_id);
      if (entry) {
        entry.streak = s.current_streak;
        entry.maxStreak = s.max_streak;
      }
    }

    // Merge learning profiles
    for (const lp of learningProfiles || []) {
      const entry = studentMap.get(lp.user_id);
      if (entry) {
        entry.questionsAnswered += lp.total_questions_answered;
        entry.correctAnswers += lp.correct_answers;
      }
    }

    // Merge goals
    for (const g of goals || []) {
      const entry = studentMap.get(g.user_id);
      if (entry) entry.goalsCompleted += 1;
    }

    // Calculate score: goals completed is primary, with streak and accuracy as tiebreakers
    for (const entry of studentMap.values()) {
      entry.score = (entry.goalsCompleted * 20) + (entry.streak * 5) + (entry.correctAnswers * 1);
    }

    // Sort by goals completed first, then score for tiebreaking
    const leaderboard = Array.from(studentMap.values())
      .sort((a, b) => {
        if (b.goalsCompleted !== a.goalsCompleted) return b.goalsCompleted - a.goalsCompleted;
        return b.score - a.score;
      })
      .slice(0, 50);

    return new Response(JSON.stringify({
      leaderboard,
      currentUserId: user.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return new Response(JSON.stringify({ error: "Failed to load leaderboard" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
