import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import OptionsPage from './components/OptionsPage'
import { I18nProvider } from './i18n/I18nProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <OptionsPage />
    </I18nProvider>
  </StrictMode>,
)
