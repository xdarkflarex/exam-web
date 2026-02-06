'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AdminHeader } from '@/components/admin'
import { logger } from '@/lib/logger'
import { 
  Users, Plus, Search, Edit2, Trash2, X, Check, School,
  GraduationCap, UserPlus, FileText, ChevronDown, RefreshCw,
  AlertCircle
} from 'lucide-react'

interface ClassData {
  id: string
  name: string
  grade: number | null
  school: string | null
  studentCount: number
  examCount: number
  created_at: string
}

interface Student {
  id: string
  full_name: string
  email: string
  class_id: string | null
}

export default function ClassesManagementPage() {
  const supabase = createClient()
  
  const [classes, setClasses] = useState<ClassData[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null)
  
  // Form states
  const [formName, setFormName] = useState('')
  const [formGrade, setFormGrade] = useState<number>(12)
  const [formSchool, setFormSchool] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch classes
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false })

      if (classesError) {
        logger.supabaseError('fetch classes', classesError)
        return
      }

      // Fetch student counts per class
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('class_id')
        .eq('role', 'student')

      const studentCountMap = new Map<string, number>()
      for (const profile of profilesData || []) {
        if (profile.class_id) {
          studentCountMap.set(profile.class_id, (studentCountMap.get(profile.class_id) || 0) + 1)
        }
      }

      // Fetch exam counts per class
      const { data: examsData } = await supabase
        .from('exams')
        .select('class_id')

      const examCountMap = new Map<string, number>()
      for (const exam of examsData || []) {
        if (exam.class_id) {
          examCountMap.set(exam.class_id, (examCountMap.get(exam.class_id) || 0) + 1)
        }
      }

      const formattedClasses: ClassData[] = (classesData || []).map(c => ({
        id: c.id,
        name: c.name,
        grade: c.grade,
        school: c.school,
        studentCount: studentCountMap.get(c.id) || 0,
        examCount: examCountMap.get(c.id) || 0,
        created_at: c.created_at
      }))

      setClasses(formattedClasses)

      // Fetch all students for assignment
      const { data: allStudents } = await supabase
        .from('profiles')
        .select('id, full_name, email, class_id')
        .eq('role', 'student')
        .order('full_name')

      setStudents(allStudents || [])

    } catch (err) {
      logger.error('Fetch classes error', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClass = async () => {
    if (!formName.trim()) {
      setFormError('Vui lòng nhập tên lớp')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const newId = `class_${Date.now()}`
      const { error } = await supabase
        .from('classes')
        .insert({
          id: newId,
          name: formName.trim(),
          grade: formGrade,
          school: formSchool.trim() || null
        })

      if (error) {
        setFormError(logger.supabaseError('create class', error))
        return
      }

      setShowCreateModal(false)
      resetForm()
      fetchData()
    } catch (err) {
      logger.error('Create class error', err)
      setFormError('Đã xảy ra lỗi')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateClass = async () => {
    if (!selectedClass || !formName.trim()) {
      setFormError('Vui lòng nhập tên lớp')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const { error } = await supabase
        .from('classes')
        .update({
          name: formName.trim(),
          grade: formGrade,
          school: formSchool.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedClass.id)

      if (error) {
        setFormError(logger.supabaseError('update class', error))
        return
      }

      setShowEditModal(false)
      resetForm()
      fetchData()
    } catch (err) {
      logger.error('Update class error', err)
      setFormError('Đã xảy ra lỗi')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClass = async (classId: string) => {
    if (!confirm('Bạn có chắc muốn xóa lớp này? Học sinh trong lớp sẽ không bị xóa.')) {
      return
    }

    try {
      // First remove class_id from students
      await supabase
        .from('profiles')
        .update({ class_id: null })
        .eq('class_id', classId)

      // Then delete the class
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', classId)

      if (error) {
        logger.supabaseError('delete class', error)
        return
      }

      fetchData()
    } catch (err) {
      logger.error('Delete class error', err)
    }
  }

  const handleAssignStudent = async (studentId: string, classId: string | null) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ class_id: classId })
        .eq('id', studentId)

      if (error) {
        logger.supabaseError('assign student', error)
        return
      }

      // Update local state
      setStudents(students.map(s => 
        s.id === studentId ? { ...s, class_id: classId } : s
      ))
      
      // Update class counts
      fetchData()
    } catch (err) {
      logger.error('Assign student error', err)
    }
  }

  const openEditModal = (classData: ClassData) => {
    setSelectedClass(classData)
    setFormName(classData.name)
    setFormGrade(classData.grade || 12)
    setFormSchool(classData.school || '')
    setShowEditModal(true)
  }

  const openAssignModal = (classData: ClassData) => {
    setSelectedClass(classData)
    setShowAssignModal(true)
  }

  const resetForm = () => {
    setFormName('')
    setFormGrade(12)
    setFormSchool('')
    setFormError('')
    setSelectedClass(null)
  }

  const filteredClasses = classes.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.school?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const unassignedStudents = students.filter(s => !s.class_id)
  const assignedStudents = selectedClass 
    ? students.filter(s => s.class_id === selectedClass.id)
    : []

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <AdminHeader 
        title="Quản lý lớp học" 
        subtitle={`${classes.length} lớp trong hệ thống`}
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                <School className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{classes.length}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Tổng lớp</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                  {classes.reduce((sum, c) => sum + c.studentCount, 0)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Học sinh đã xếp lớp</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{unassignedStudents.length}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Chưa xếp lớp</p>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm lớp học..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tạo lớp mới
            </button>
          </div>
        </div>

        {/* Classes Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <School className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Chưa có lớp học</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">Tạo lớp học đầu tiên để bắt đầu quản lý</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tạo lớp mới
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClasses.map((classData) => (
              <div 
                key={classData.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{classData.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Khối {classData.grade} {classData.school && `• ${classData.school}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(classData)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Edit2 className="w-4 h-4 text-slate-500" />
                    </button>
                    <button
                      onClick={() => handleDeleteClass(classData.id)}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Users className="w-4 h-4" />
                    <span>{classData.studentCount} học sinh</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <FileText className="w-4 h-4" />
                    <span>{classData.examCount} đề thi</span>
                  </div>
                </div>

                <button
                  onClick={() => openAssignModal(classData)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Quản lý học sinh
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Tạo lớp mới</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tên lớp <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="VD: 12A1"
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Khối</label>
                <select
                  value={formGrade}
                  onChange={(e) => setFormGrade(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                >
                  <option value={10}>Khối 10</option>
                  <option value={11}>Khối 11</option>
                  <option value={12}>Khối 12</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Trường</label>
                <input
                  type="text"
                  value={formSchool}
                  onChange={(e) => setFormSchool(e.target.value)}
                  placeholder="VD: THPT Nguyễn Du"
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {formError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); resetForm() }}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateClass}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white rounded-lg text-sm transition-colors"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Tạo lớp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowEditModal(false); resetForm() }} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Chỉnh sửa lớp</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tên lớp</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Khối</label>
                <select
                  value={formGrade}
                  onChange={(e) => setFormGrade(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                >
                  <option value={10}>Khối 10</option>
                  <option value={11}>Khối 11</option>
                  <option value={12}>Khối 12</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Trường</label>
                <input
                  type="text"
                  value={formSchool}
                  onChange={(e) => setFormSchool(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {formError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowEditModal(false); resetForm() }}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleUpdateClass}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white rounded-lg text-sm transition-colors"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Students Modal */}
      {showAssignModal && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAssignModal(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                Quản lý học sinh - {selectedClass.name}
              </h3>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Students in class */}
                <div>
                  <h4 className="font-medium text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-teal-600" />
                    Trong lớp ({assignedStudents.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {assignedStudents.length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">Chưa có học sinh</p>
                    ) : (
                      assignedStudents.map(student => (
                        <div key={student.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-white">{student.full_name}</p>
                            <p className="text-xs text-slate-500">{student.email}</p>
                          </div>
                          <button
                            onClick={() => handleAssignStudent(student.id, null)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                            title="Xóa khỏi lớp"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Unassigned students */}
                <div>
                  <h4 className="font-medium text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    Chưa xếp lớp ({unassignedStudents.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {unassignedStudents.length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">Tất cả đã xếp lớp</p>
                    ) : (
                      unassignedStudents.map(student => (
                        <div key={student.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-white">{student.full_name}</p>
                            <p className="text-xs text-slate-500">{student.email}</p>
                          </div>
                          <button
                            onClick={() => handleAssignStudent(student.id, selectedClass.id)}
                            className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600"
                            title="Thêm vào lớp"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowAssignModal(false)}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
