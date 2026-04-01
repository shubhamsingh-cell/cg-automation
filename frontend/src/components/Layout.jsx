import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-6 flex flex-col min-h-screen">
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="mt-auto pt-8 pb-4 text-center text-xs text-gray-500 border-t border-gray-800">
          Created by Ayushi Singh &middot; CG Automation &middot; <a href="https://media-plan-generator.onrender.com" className="text-blue-400 hover:text-blue-300">Nova AI Suite</a>
        </footer>
      </main>
    </div>
  );
}
