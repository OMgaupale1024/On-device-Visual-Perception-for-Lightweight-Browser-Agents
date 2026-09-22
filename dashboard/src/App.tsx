import { Routes, Route } from 'react-router-dom'
import { Layout } from '@components/layout/Layout'
import { DashboardOverview } from '@pages/DashboardOverview'
import { WebsiteComparison } from '@pages/WebsiteComparison'
import { WebsiteDetails } from '@pages/WebsiteDetails'
import { RunDetails } from '@pages/RunDetails'
import { ImportBenchmark } from '@pages/ImportBenchmark'
import { BenchmarkSettings } from '@pages/BenchmarkSettings'
import { BenchmarkProvider } from '@services/BenchmarkContext'
import { Toaster } from '@components/ui/Toaster'

function App() {
  return (
    <BenchmarkProvider>
      <Toaster>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<DashboardOverview />} />
            <Route path="comparison" element={<WebsiteComparison />} />
            <Route path="website/:id" element={<WebsiteDetails />} />
            <Route path="run/:websiteId/:runIndex" element={<RunDetails />} />
            <Route path="import" element={<ImportBenchmark />} />
            <Route path="settings" element={<BenchmarkSettings />} />
          </Route>
        </Routes>
      </Toaster>
    </BenchmarkProvider>
  )
}

export default App