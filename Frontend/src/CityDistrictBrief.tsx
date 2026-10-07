import type { DistrictData } from "./city";
import { ControlButton } from "./ui";
import "./cityDistrictBrief.css";

export function CityDistrictBrief ({ districts, pageRange, onGoRepo }: {
  districts: readonly DistrictData[];
  pageRange: string;
  onGoRepo: (repoId: string) => void;
}) {
  return (
    <section className="city-district-brief" aria-labelledby="city-district-brief-heading">
      <div className="city-district-brief-heading">
        <h3 id="city-district-brief-heading">Visible districts</h3>
        <p>Workspace-wide. {pageRange}.</p>
      </div>
      {districts.length === 0 ? (
        <p className="city-district-brief-empty">No districts to show.</p>
      ) : (
        <ul className="city-district-brief-list">
          {districts.map((district, index) => (
            <li key={JSON.stringify([district.repo.id, index])}>
              <ControlButton className="city-district-identity"
                aria-label={`Open ${district.repo.id} in Overview`}
                onClick={() => onGoRepo(district.repo.id)}>
                {district.repo.id}
              </ControlButton>
              <dl>
                <div>
                  <dt>Git status</dt>
                  <dd>{district.repo.offline ? "Repository offline"
                    : district.repo.status_valid !== true ? "Git status unavailable"
                    : district.repo.clean ? "Working tree clean"
                    : <><span className="font-mono tabular-nums">{district.repo.count.toLocaleString("en-US")}</span> uncommitted</>}</dd>
                </div>
                <div>
                  <dt>Plan tasks</dt>
                  <dd><span className="font-mono tabular-nums">{district.inProgress.length.toLocaleString("en-US")}</span> task{district.inProgress.length === 1 ? "" : "s"} marked in progress</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
