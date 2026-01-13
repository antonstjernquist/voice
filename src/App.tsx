import { Overlay } from "./components/Overlay";
import { Settings } from "./components/Settings";
import "./App.css";

function App() {
  const isSettingsWindow = window.location.pathname === "/settings";

  if (isSettingsWindow) {
    return <Settings />;
  }

  return <Overlay />;
}

export default App;
