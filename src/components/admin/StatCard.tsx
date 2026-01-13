import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: {
    value: number
    isUp: boolean
  }
  color?: 'teal' | 'blue' | 'purple' | 'amber' | 'rose'
}

const colorClasses = {
  teal: {
    bg: 'bg-teal-50',
    icon: 'text-teal-600',
    trend: 'text-teal-600'
  },
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    trend: 'text-blue-600'
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    trend: 'text-purple-600'
  },
  amber: {
    bg: 'bg-amber-50',
    icon: 'text-amber-600',
    trend: 'text-amber-600'
  },
  rose: {
    bg: 'bg-rose-50',
    icon: 'text-rose-600',
    trend: 'text-rose-600'
  }
}

export default function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  color = 'teal' 
}: StatCardProps) {
  const colors = colorClasses[color]

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{title}</p>
          <p className="text-3xl font-bold text-slate-800">{value}</p>
          {trend && (
            <p className={`text-sm mt-2 ${trend.isUp ? 'text-green-600' : 'text-red-500'}`}>
              {trend.isUp ? '↑' : '↓'} {trend.value}% so với tuần trước
            </p>
          )}
        </div>
        <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${colors.icon}`} />
        </div>
      </div>
    </div>
  )
}
