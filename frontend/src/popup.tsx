import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PopupApp from './components/Popup'
import { I18nProvider } from './i18n/I18nProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PopupApp />
    </I18nProvider>
  </StrictMode>,
)
