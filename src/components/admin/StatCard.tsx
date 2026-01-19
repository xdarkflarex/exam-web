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
    <div className="bg-slate-200 dark:bg-slate-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-slate-300 dark:border-slate-700 shadow-sm card-interactive slide-in-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-0.5 sm:mb-1 truncate">{title}</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 dark:text-slate-100 font-baloo">{value}</p>
          {trend && (
            <p className={`text-xs sm:text-sm mt-1 sm:mt-2 ${trend.isUp ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {trend.isUp ? '↑' : '↓'} {trend.value}%
            </p>
          )}
        </div>
        <div className={`w-10 h-10 sm:w-12 sm:h-12 ${colors.bg} rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 hover-scale`}>
          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${colors.icon} transition-transform duration-75`} />
        </div>
      </div>
    </div>
  )
}
