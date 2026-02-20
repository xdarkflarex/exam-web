'use client'

import React, { useState } from 'react'
import { HistoryEntry, Exam } from '../types'
import { 
  History, 
  Clock, 
  FileText, 
  Play, 
  X, 
  Calendar,
  TrendingUp,
  Target,
  ChevronRight
} from 'lucide-react'
import { StudentHeader } from './student'

interface StudentDashboardProps {
  onStartExam: (examId: string, examTitle: string) => void
  onLogout: () => void
  history: HistoryEntry[]
  onClearHistory: () => void
  onViewResult: (attemptId: string) => void
  loadingError: string | null
  exams: Exam[]
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ 
  onStartExam, 
  onLogout, 
  history, 
  onClearHistory, 
  onViewResult,
  loadingError,
  exams
}) => {
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const totalAttempts = history.length
  const bestScore = history.length > 0 ? Math.max(...history.map(h => h.score)) : 0
  const avgScore = history.length > 0 
    ? history.reduce((sum, h) => sum + h.score, 0) / history.length 
    : 0

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 transition-colors">
      <StudentHeader title="Luyện Thi THPT" />
      
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Welcome Section */}
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white mb-2">
            Xin chào! 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Chọn đề thi và bắt đầu luyện tập ngay hôm nay.
          </p>
        </div>

        {/* Error Message */}
        {loadingError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl mb-6 text-sm">
            {loadingError}
          </div>
        )}

        {/* Quick Stats */}
        {totalAttempts > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8 animate-list-stagger">
            <div className="bg-slate-200 dark:bg-slate-800 rounded-xl p-4 border border-slate-300 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <FileText className="w-3.5 h-3.5" />
                Đã làm
              </div>
              <div className="text-xl font-bold text-slate-800 dark:text-white">
                {totalAttempts}
              </div>
            </div>
            <div className="bg-slate-200 dark:bg-slate-800 rounded-xl p-4 border border-slate-300 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <Target className="w-3.5 h-3.5" />
                Cao nhất
              </div>
              <div className="text-xl font-bold text-teal-600 dark:text-teal-400">
                {bestScore.toFixed(1)}
              </div>
            </div>
            <div className="bg-slate-200 dark:bg-slate-800 rounded-xl p-4 border border-slate-300 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Trung bình
              </div>
              <div className="text-xl font-bold text-slate-800 dark:text-white">
                {avgScore.toFixed(1)}
              </div>
            </div>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            Đề thi có sẵn
          </h2>
          <button 
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          >
            <History className="w-4 h-4" />
            Lịch sử
          </button>
        </div>

        {/* Exam List */}
        <div className="space-y-3 animate-list-stagger">
          {exams.map((exam) => (
            <button
              key={exam.id}
              onClick={() => onStartExam(exam.id, exam.title)}
              className="w-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-4 text-left hover:border-teal-400 dark:hover:border-teal-600 hover:shadow-sm transition-all group hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
                    {exam.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {exam.duration} phút
                    </span>
                    <span>{exam.subject}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900/50 transition-colors">
                    <Play className="w-4 h-4 text-teal-600 dark:text-teal-400 ml-0.5" />
                  </div>
                </div>
              </div>
            </button>
          ))}

          {exams.length === 0 && (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Chưa có đề thi nào</p>
            </div>
          )}
        </div>

        {/* Recent History Preview */}
        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
              Kết quả gần đây
            </h2>
            <div className="space-y-2 animate-list-stagger">
              {history.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onViewResult(item.id)}
                  className="w-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between hover:border-slate-400 dark:hover:border-slate-600 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      item.score >= 8 
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                        : item.score >= 5 
                          ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                          : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    }`}>
                      {item.score.toFixed(1)}
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-800 dark:text-white text-sm">
                        {item.subject}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(item.date).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-in" 
            onClick={() => setShowHistoryModal(false)}
          />
          <div className="relative bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col overflow-hidden scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                Lịch sử làm bài
              </h3>
              <button 
                onClick={() => setShowHistoryModal(false)} 
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Chưa có lịch sử làm bài</p>
                </div>
              ) : (
                history.map(item => (
                  <button 
                    key={item.id} 
                    onClick={() => {
                      setShowHistoryModal(false)
                      onViewResult(item.id)
                    }}
                    className="w-full bg-slate-200 dark:bg-slate-700 p-4 rounded-xl flex items-center justify-between hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    <div className="text-left">
                      <div className="font-medium text-slate-800 dark:text-white mb-1">
                        {item.subject}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.date).toLocaleDateString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <div className={`text-xl font-bold ${
                      item.score >= 5 
                        ? 'text-teal-600 dark:text-teal-400' 
                        : 'text-red-500 dark:text-red-400'
                    }`}>
                      {item.score.toFixed(1)}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Modal Footer */}
            {history.length > 0 && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                <button 
                  onClick={() => {
                    if(confirm("Xóa toàn bộ lịch sử làm bài?")) {
                      onClearHistory()
                    }
                  }}
                  className="w-full text-center text-sm text-red-500 hover:text-red-600 dark:hover:text-red-400 py-2"
                >
                  Xóa tất cả lịch sử
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentDashboard
