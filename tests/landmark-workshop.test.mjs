import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDMARK_TEMPLATES, fillPixels, landmarkItems, makeLandmarkRecord,
  paintPixel, sanitizePixels, validateLandmarkRecord,
} from '../P5 Programme/buddy-kit/client/city-builder/landmark-templates.js';

test('Landmark Workshop exposes four bounded bilingual templates',()=>{
  assert.deepEqual(Object.keys(LANDMARK_TEMPLATES),['champion-plaza','pixel-mural','festival-plaza','smart-gate']);
  assert.equal(landmarkItems('en').length,4);
  assert.equal(landmarkItems('zh-Hant')[0].name,'冠軍廣場');
  for(const item of landmarkItems()){
    assert.ok(item.complexity>=1&&item.complexity<=6);
    assert.equal(item.footprint.length,2);
  }
});

test('landmark defaults and validators repair corrupt configuration',()=>{
  const plaza=makeLandmarkRecord('champion-plaza',{x:4,z:-2,yaw:1});
  assert.equal(plaza.landmark.config.statueSource,'custom');
  assert.deepEqual([plaza.x,plaza.z,plaza.yaw],[4,-2,1]);
  const gate=makeLandmarkRecord('smart-gate');
  gate.landmark.config={mode:'trained-ai',threshold:999,action:'predict',override:'maybe'};
  assert.deepEqual(validateLandmarkRecord(gate).config,{mode:'proximity',threshold:10,action:'open',override:'auto'});
  assert.equal(validateLandmarkRecord({...gate,landmark:{...gate.landmark,version:99}}).reason,'unknown-version');
  assert.equal(validateLandmarkRecord({...gate,id:'landmark:future',landmark:{version:1,templateId:'future',config:{}}}).reason,'unknown-template');
});

test('pixel mural keeps a fixed palette grid with fill and symmetry',()=>{
  assert.equal(sanitizePixels(null).length,256);
  const filled=fillPixels(99);assert.equal(filled.length,256);assert.ok(filled.every(v=>v===7));
  const horizontal=paintPixel(fillPixels(0),2,3,4,'horizontal');
  assert.equal(horizontal[3*16+2],4);assert.equal(horizontal[3*16+13],4);
  const vertical=paintPixel(fillPixels(0),5,1,6,'vertical');
  assert.equal(vertical[1*16+5],6);assert.equal(vertical[14*16+5],6);
});
