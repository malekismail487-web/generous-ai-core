import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

interface Row {
  topic: string | null;
  subject: string | null;
  avg_confidence: number;
  avg_accuracy: number;
  calibration_gap: number;
  sample_size: number;
}

/**
 * Calibration Curve — student dashboard widget.
 * X = average confidence, Y = average accuracy. Diagonal = perfectly calibrated.
 */
export function CalibrationCurve({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("confidence_calibration_stats")
        .select("topic, subject, avg_confidence, avg_accuracy, calibration_gap, sample_size")
        .eq("user_id", userId)
        .gte("sample_size", 1)
        .order("sample_size", { ascending: false })
        .limit(80);
      if (!cancelled) {
        setRows((data ?? []) as Row[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const points = rows.map((r) => ({
    x: Math.round(r.avg_confidence * 100),
    y: Math.round(r.avg_accuracy * 100),
    topic: r.topic ?? r.subject ?? "—",
    n: r.sample_size,
  }));

  const overallGap = rows.length
    ? rows.reduce((a, r) => a + r.calibration_gap * r.sample_size, 0) /
      Math.max(1, rows.reduce((a, r) => a + r.sample_size, 0))
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="w-4 h-4" />
          Confidence vs. Accuracy
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : points.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground text-center px-4">
            Answer a few questions with a confidence level to see your calibration curve.
          </div>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={[...points].sort((a, b) => a.x - b.x)}
                  margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={[0, 100]}
                    tickCount={6}
                    label={{ value: "Confidence %", position: "insideBottom", offset: -5, fontSize: 11 }}
                    fontSize={11}
                  />
                  <YAxis
                    type="number"
                    domain={[0, 100]}
                    tickCount={6}
                    label={{ value: "Accuracy %", angle: -90, position: "insideLeft", fontSize: 11 }}
                    fontSize={11}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(_v, _n, p: any) => [`${p.payload.y}% accurate at ${p.payload.x}% confidence (${p.payload.n} questions)`, p.payload.topic]}
                  />
                  <ReferenceLine
                    segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="y"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {overallGap > 0.12
                ? "You tend to be overconfident — slow down on questions that feel easy."
                : overallGap < -0.12
                ? "You're often more accurate than you think — trust yourself more."
                : "Your confidence is well-calibrated to your actual accuracy."}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
