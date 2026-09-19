// Commercial vehicle intake — deliberately separate from the CC0 catalogue.
//
// This is a very narrow exception for files supplied and owner-vetted by the
// programme team.  A record becomes shippable only after its GLB is listed in
// `library/COMMERCIAL-VEHICLE-INTAKE.json` with status "accepted".  Keeping
// this list here makes the traffic loader, picker, and audit agree on exactly
// the same set of cars.
import { LIBRARY } from './library.js';

export const COMMERCIAL_VEHICLE_INTAKE_URL = '../library/COMMERCIAL-VEHICLE-INTAKE.json';

/** Library entries explicitly admitted by the owner-vetted vehicle intake. */
export function acceptedCommercialVehicles() {
  return LIBRARY.filter((item) => item.category === 'vehicles' && item.commercialVehicle === true);
}

/** A stable order makes ambient traffic and screenshots repeatable. */
export function commercialTrafficVehicleIds() {
  return acceptedCommercialVehicles().map((item) => item.id).sort();
}
