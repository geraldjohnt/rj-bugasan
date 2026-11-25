import { PageHeader, EmptyState } from '../../components/Feedback.jsx';

export function PlannedPage({ item }) {
  return (
    <div className="page">
      <PageHeader title={item.label} />
      <div className="panel">
        <EmptyState icon="planned" title="Not built yet">
          {item.label} is scheduled for Phase {item.phase} of the development roadmap.
        </EmptyState>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="page">
      <PageHeader title="Page not found" />
      <div className="panel"><EmptyState icon="warning" title="This page does not exist">Use the menu on the left to open a page.</EmptyState></div>
    </div>
  );
}
