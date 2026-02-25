import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { OverviewPage } from "./components/pages/OverviewPage";
import { ReposPage } from "./components/pages/ReposPage";
import { ConceptsPage } from "./components/pages/ConceptsPage";
import { QueuePage } from "./components/pages/QueuePage";
import { SyncPage } from "./components/pages/SyncPage";
import { api } from "./api/client";

export default function App() {
  const [repo, setRepo] = useState("");
  const [period, setPeriod] = useState("week");
  const [repoList, setRepoList] = useState<string[]>([]);

  useEffect(() => {
    api
      .getRepos()
      .then((repos) => setRepoList(repos.map((r) => r.repo)))
      .catch(() => {});
  }, []);

  return (
    <Shell
      repo={repo}
      period={period}
      repos={repoList}
      onRepoChange={setRepo}
      onPeriodChange={setPeriod}
    >
      <Routes>
        <Route
          path="/"
          element={
            <OverviewPage repo={repo || undefined} period={period} />
          }
        />
        <Route path="/repos" element={<ReposPage />} />
        <Route
          path="/concepts"
          element={<ConceptsPage repo={repo || undefined} />}
        />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/sync" element={<SyncPage />} />
      </Routes>
    </Shell>
  );
}
