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
    bg: 'bg-teal-50 dark:bg-teal-900/30',
    icon: 'text-teal-600 dark:text-teal-400',
    trend: 'text-teal-600 dark:text-teal-400'
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
    trend: 'text-blue-600 dark:text-blue-400'
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    icon: 'text-purple-600 dark:text-purple-400',
    trend: 'text-purple-600 dark:text-purple-400'
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    icon: 'text-amber-600 dark:text-amber-400',
    trend: 'text-amber-600 dark:text-amber-400'
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-900/30',
    icon: 'text-rose-600 dark:text-rose-400',
    trend: 'text-rose-600 dark:text-rose-400'
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
    <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl p-6 border border-slate-300 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
          {trend && (
            <p className={`text-sm mt-2 ${trend.isUp ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
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
