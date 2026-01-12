import React, { useState } from 'react';
import { HistoryEntry, Exam } from '../types';
import { History, Zap, BookOpen, FileQuestion, X, Calendar } from 'lucide-react';
import GlobalHeader from './GlobalHeader';

interface StudentDashboardProps {
    onStartExam: (examId: string, examTitle: string) => void;
    onLogout: () => void;
    history: HistoryEntry[];
    onClearHistory: () => void;
    loadingError: string | null;
    exams: Exam[];
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ 
    onStartExam, 
    onLogout, 
    history, 
    onClearHistory, 
    loadingError,
    exams
}) => {
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    return (
        <div className="min-h-screen font-sans pb-20 relative bg-sky-50 dark:bg-slate-950 transition-colors">
            <GlobalHeader title="MathPrep.AI" />
            
            {/* Additional Actions Bar */}
            <div className="bg-white/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 px-6 py-3">
                <div className="max-w-7xl mx-auto flex justify-end">
                    <button 
                        onClick={() => setShowHistoryModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                    >
                        <History className="w-4 h-4" /> Lịch sử
                    </button>
                </div>
            </div>

            {/* Header / Hero */}
            <header className="relative py-12 px-6 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-semibold mb-6 animate-fade-in">
                    <Zap className="w-4 h-4 fill-indigo-600 dark:fill-indigo-400" />
                    Hệ thống luyện thi thông minh
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight animate-fade-in">
                    Chinh Phục <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">Toán THPT</span>
                </h1>
                <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto mb-8 animate-fade-in">
                    Chọn chuyên đề bạn muốn ôn luyện. AI sẽ tạo đề thi mới cho bạn mỗi lần thực hành.
                </p>
                
                {loadingError && (
                     <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-6 py-4 rounded-xl max-w-md mx-auto mb-8 flex items-center gap-3 animate-fade-in">
                         <div className="w-2 h-2 rounded-full bg-red-500"></div>
                         {loadingError}
                     </div>
                )}
            </header>

            {/* Exam Grid */}
            <main className="max-w-5xl mx-auto px-4 sm:px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {exams.map((exam, idx) => (
                        <button
                            key={exam.id}
                            onClick={() => onStartExam(exam.id, exam.title)}
                            className="group relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-800 rounded-2xl p-6 text-left hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:hover:shadow-indigo-900/20 transition-all duration-300 animate-fade-in"
                            style={{animationDelay: `${idx * 0.1}s`}}
                        >
                            <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                                <FileQuestion className="w-6 h-6" />
                            </div>
                            
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                                {exam.title}
                            </h3>
                            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
                                {exam.duration} phút • {exam.subject}
                            </p>

                            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                <BookOpen className="w-5 h-5 text-indigo-400" />
                            </div>
                        </button>
                    ))}
                </div>
            </main>

            {/* History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm" onClick={() => setShowHistoryModal(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-fade-in">
                        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-900/50">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                Lịch sử luyện thi
                            </h3>
                            <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            </button>
                        </div>
                        <div className="overflow-y-auto p-4 space-y-3">
                            {history.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 dark:text-slate-600">
                                    <div className="bg-gray-100 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <History className="w-8 h-8 opacity-50" />
                                    </div>
                                    <p>Chưa có kết quả thi nào.</p>
                                </div>
                            ) : (
                                history.map(item => (
                                    <div key={item.id} className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 p-4 rounded-xl flex items-center justify-between hover:shadow-md transition-shadow">
                                        <div>
                                            <div className="font-bold text-gray-800 dark:text-gray-200 mb-1">{item.subject}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(item.date).toLocaleDateString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-xl font-bold ${item.score >= 5 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-500 dark:text-red-400'}`}>
                                                {item.score.toFixed(1)}
                                            </div>
                                            <div className="text-xs text-gray-400 dark:text-gray-500">Điểm</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {history.length > 0 && (
                            <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 text-center">
                                <button 
                                    onClick={() => {
                                        if(confirm("Xóa toàn bộ lịch sử?")) {
                                            onClearHistory();
                                        }
                                    }}
                                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                                >
                                    Xóa lịch sử
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentDashboard;
