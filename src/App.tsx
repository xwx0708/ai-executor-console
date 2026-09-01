import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import DashboardPage from '@/pages/DashboardPage'
import TasksPage from '@/pages/TasksPage'
import NewTaskPage from '@/pages/NewTaskPage'
import TaskDetailPage from '@/pages/TaskDetailPage'
import ResultsPage from '@/pages/ResultsPage'
import ModelsPage from '@/pages/ModelsPage'
import ServerPage from '@/pages/ServerPage'
import UsersPage from '@/pages/UsersPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/new" element={<NewTaskPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/server" element={<ServerPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
