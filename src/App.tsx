import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import DhcpHealthCheckPage from './pages/DhcpHealthCheckPage';
import './App.css';

function HomePage() {
  const cards = [
    {
      title: 'DHCP Health Check Automation',
      description:
        'Enterprise DHCP monitoring and reporting solution that performs automated health assessments across multiple DHCP servers, verifies failover configurations, tracks scope utilization, and provides actionable operational reports for proactive infrastructure management.',
      to: '/dhcp-health-check',
      accent: 'from-emerald-500/20 to-emerald-500/5',
      border: 'border-emerald-500/40',
      icon: '🖧',
    },
  ];

  return (
    <div className="min-h-screen bg-[#050b14] p-6 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-white">Operations Dashboard</h1>
          <p className="mt-2 text-sm text-gray-400">
            Select a module to view detailed monitoring and health information.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {cards.map((card) => (
            <Link key={card.title} to={card.to} className="group">
              <motion.div
                whileHover={{ y: 4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`relative overflow-hidden rounded-2xl border ${card.border} bg-gradient-to-br ${card.accent} p-6 shadow-lg shadow-black/30 backdrop-blur`}
              >
                <div className="relative z-10">
                  <div className="text-3xl">{card.icon}</div>
                  <h2 className="mt-4 text-lg font-semibold text-white">{card.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-300">{card.description}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-emerald-300">
                    Open module
                    <span className="transition group-hover:translate-x-1">→</span>
                  </span>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dhcp-health-check" element={<DhcpHealthCheckPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;