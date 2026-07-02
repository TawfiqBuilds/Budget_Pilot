import React from "react";
import Auth from "./Auth";
import BudgetLedger from "./BudgetLedger";

export default function App() {
  return <Auth onAuthed={(session) => <BudgetLedger user={session.user} />} />;
}
