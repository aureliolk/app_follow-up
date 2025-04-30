'use client';

import {
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell // Import Cell for individual bar colors
} from 'recharts';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import type { DealsByStageDataPoint } from "@/lib/actions/dashboardActions"; // Import the specific type

interface DealsByStageChartProps {
  data: DealsByStageDataPoint[];
}

export default function DealsByStageChart({ data }: DealsByStageChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Negócios por Etapa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Não há dados de negócios para exibir no gráfico.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Negócios por Etapa</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart 
            data={data}
            margin={{
              top: 5,
              right: 5, // Reduced right margin
              left: -20, // Adjusted left margin for YAxis labels
              bottom: 5,
            }}
            barGap={8} // Add gap between bars
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 10 }} 
              // interval={0} // Ensure all labels are shown if needed, might clutter
              // angle={-30} // Angle labels if they overlap
              // textAnchor="end" // Adjust anchor if angled
            />
            <YAxis 
              allowDecimals={false} 
              tick={{ fontSize: 10 }} 
              width={20} // Explicit width for YAxis
            />
            <Tooltip 
              contentStyle={{ fontSize: '12px', borderRadius: '0.5rem' }} 
              cursor={{ fill: 'hsl(var(--muted))' }} // Use muted color for cursor
            />
            <Bar dataKey="dealCount" name="Negócios" radius={[4, 4, 0, 0]}> {/* Add radius to top corners */}
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || '#8884d8'} /> // Use stage color
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
} 