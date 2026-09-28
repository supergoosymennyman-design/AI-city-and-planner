// Exercise version is independent of the student's learned classifier.
export const RECYCLING_EXERCISES=Object.freeze({
 'batch-1':Object.freeze({dataset:'city-recycling-v1',catalogue:'cityRecycling',count:9}),
 'materials-v2':Object.freeze({dataset:'city-recycling-v2',catalogue:'cityRecyclingV2',count:12}),
});
export function resultDataset(result){return result?.scenario==='personal'?null:result?.datasetVersion||'city-recycling-v1';}
export function resolveExercise(explicit,saved,historical,hasPhotos=false){
 for(const value of [explicit,saved,historical?.scenario])if(value==='personal'||RECYCLING_EXERCISES[value])return value;
 return hasPhotos?'personal':'materials-v2';
}
