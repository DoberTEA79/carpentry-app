import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './styles.css'
import App from './App'
import Constructor from './pages/Constructor'
import Kitting from './pages/Kitting'
import Operator from './pages/Operator'
import Login from './pages/Login'
import CuratorPage from "./pages/Curator";
import CuratorBoardsPage from "./pages/CuratorBoards";
import AXPage from "./pages/AX";
import MasterDashboardPage from "./pages/MasterDashboard";

const router = createBrowserRouter([
  { path: '/', element: <App />,
    children: [
      { index: true, element: <Login /> },
      { path: 'constructor', element: <Constructor /> },
      { path: 'kitting', element: <Kitting /> },
      { path: 'operator', element: <Operator /> },
      { path: 'curator', element: <CuratorPage /> },
      { path: 'curator/formats', element: <CuratorBoardsPage /> },
      { path: 'ax', element: <AXPage /> },
      { path: 'masters', element: <MasterDashboardPage /> }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
