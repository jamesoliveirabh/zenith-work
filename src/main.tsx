import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import AdminApp from "./AdminApp.tsx";
import { isAdminHost } from "./lib/admin/host";
import "./index.css";

const Root = isAdminHost() ? AdminApp : App;

createRoot(document.getElementById("root")!).render(<Root />);
