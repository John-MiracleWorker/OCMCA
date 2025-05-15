"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertCircle, X } from 'lucide-react';

const CALCULATION_TYPES = {
  WEIGHT_DOSE: 'WEIGHT_DOSE',
  DRIP_RATE: 'DRIP_RATE',
  CONVERSION_LBS_KG: 'CONVERSION_LBS_KG',
  CONVERSION_KG_LBS: 'CONVERSION_KG_LBS',
};

const DRIP_SETS = [
    { label: "10 gtts/mL (Macro)", value: "10" },
    { label: "15 gtts/mL (Macro)", value: "15" },
    { label: "20 gtts/mL (Macro)", value: "20" },
    { label: "60 gtts/mL (Micro)", value: "60" },
];

interface MedicationCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MedicationCalculator({ isOpen, onClose }: MedicationCalculatorProps) {
  const [calculationType, setCalculationType] = useState<string>(CALCULATION_TYPES.WEIGHT_DOSE);
  
  const [patientWeight, setPatientWeight] = useState<string>("");
  const [weightUnit, setWeightUnit] = useState<string>("kg");
  const [concMgPerMl, setConcMgPerMl] = useState<string>("");
  const [concMl, setConcMl] = useState<string>("1");
  const [doseRequired, setDoseRequired] = useState<string>("");
  const [doseUnit, setDoseUnit] = useState<string>("mg_kg");
  const [weightDoseResult, setWeightDoseResult] = useState<string | null>(null);

  const [totalVolume, setTotalVolume] = useState<string>("");
  const [totalTime, setTotalTime] = useState<string>("");
  const [dripSet, setDripSet] = useState<string>(DRIP_SETS[3].value);
  const [dripRateResult, setDripRateResult] = useState<string | null>(null);

  const [inputValue, setInputValue] = useState<string>("");
  const [conversionResult, setConversionResult] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);
  const clearInputs = () => {
    setPatientWeight("");
    setConcMgPerMl("");
    setConcMl("1");
    setDoseRequired("");
    setWeightDoseResult(null);
    setTotalVolume("");
    setTotalTime("");
    setDripRateResult(null);
    setInputValue("");
    setConversionResult(null);
    clearError();
  };

  useEffect(() => {
    clearInputs();
  }, [calculationType]);

  const handleCalculate = () => {
    clearError();
    setWeightDoseResult(null);
    setDripRateResult(null);
    setConversionResult(null);

    const parseNum = (val: string) => {
        const num = parseFloat(val);
        if (isNaN(num) || num < 0) throw new Error("Invalid input: All numerical inputs must be positive numbers.");
        return num;
    };

    try {
      switch (calculationType) {
        case CALCULATION_TYPES.WEIGHT_DOSE:
          const weight = parseNum(patientWeight);
          const finalWeightKg = weightUnit === 'lbs' ? weight / 2.20462 : weight;
          const concMg = parseNum(concMgPerMl);
          const concInMl = parseNum(concMl);
          if (concInMl === 0) throw new Error("Concentration volume (mL) cannot be zero.");
          const drugConcPerMl = concMg / concInMl;
          const doseReq = parseNum(doseRequired);
          let totalDoseNeeded = 0;
          if (doseUnit === "mg_kg") {
            totalDoseNeeded = finalWeightKg * doseReq;
          } else if (doseUnit === "mcg_kg") {
            totalDoseNeeded = (finalWeightKg * doseReq) / 1000;
          }
          if (drugConcPerMl === 0 && totalDoseNeeded !== 0) throw new Error("Drug concentration (mg) cannot be zero if dose is required.");
          const volumeToAdminister = drugConcPerMl === 0 ? (totalDoseNeeded === 0 ? 0 : Infinity) : totalDoseNeeded / drugConcPerMl;
          if (volumeToAdminister === Infinity) {
            setWeightDoseResult("Cannot calculate volume: Drug concentration is zero but dose is required.");
          } else {
            setWeightDoseResult(`Total Dose: ${totalDoseNeeded.toFixed(2)} mg. Volume to Administer: ${volumeToAdminister.toFixed(2)} mL.`);
          }
          break;

        case CALCULATION_TYPES.DRIP_RATE:
          const vol = parseNum(totalVolume);
          const time = parseNum(totalTime);
          const set = parseNum(dripSet);
          if (time === 0) throw new Error("Time cannot be zero.");
          const rate = (vol * set) / time;
          setDripRateResult(`Drip Rate: ${rate.toFixed(0)} gtts/min.`);
          break;

        case CALCULATION_TYPES.CONVERSION_LBS_KG:
          const lbs = parseNum(inputValue);
          const kg = lbs / 2.20462;
          setConversionResult(`${lbs.toFixed(2)} lbs = ${kg.toFixed(2)} kg.`);
          break;
        
        case CALCULATION_TYPES.CONVERSION_KG_LBS:
          const kgs = parseNum(inputValue);
          const pounds = kgs * 2.20462;
          setConversionResult(`${kgs.toFixed(2)} kg = ${pounds.toFixed(2)} lbs.`);
          break;

        default:
          break;
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
    }
  };

  const renderInputs = () => {
    switch (calculationType) {
      case CALCULATION_TYPES.WEIGHT_DOSE:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">Weight-Based Dosing</h3>
            <div>
              <Label htmlFor="patientWeight" className="font-medium text-sm text-gray-700 mb-1 block">Patient Weight:</Label>
              <div className="flex space-x-2">
                <Input id="patientWeight" type="number" value={patientWeight} onChange={(e) => setPatientWeight(e.target.value)} placeholder="e.g., 70" className="text-gray-900"/>
                <Select value={weightUnit} onValueChange={setWeightUnit}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="lbs">lbs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="drugConcentrationMg" className="font-medium text-sm text-gray-700 mb-1 block">Drug Concentration:</Label>
              <div className="flex items-center space-x-2">
                <Input id="drugConcentrationMg" type="number" value={concMgPerMl} onChange={(e) => setConcMgPerMl(e.target.value)} placeholder="e.g., 100" className="text-gray-900" aria-label="Drug concentration in mg"/>
                <span className="text-gray-500">mg /</span>
                <Input id="drugConcentrationMl" type="number" value={concMl} onChange={(e) => setConcMl(e.target.value)} placeholder="e.g., 1" className="w-[80px] text-gray-900" aria-label="Drug concentration in mL"/>
                <span className="text-gray-500">mL</span>
              </div>
            </div>
            <div>
              <Label htmlFor="doseRequired" className="font-medium text-sm text-gray-700 mb-1 block">Dose Required:</Label>
              <div className="flex space-x-2">
                <Input id="doseRequired" type="number" value={doseRequired} onChange={(e) => setDoseRequired(e.target.value)} placeholder="e.g., 0.5" className="text-gray-900"/>
                <Select value={doseUnit} onValueChange={setDoseUnit}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mg_kg">mg/kg</SelectItem>
                    <SelectItem value="mcg_kg">mcg/kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {weightDoseResult && <p className="text-green-600 font-semibold pt-2 text-sm">Result: {weightDoseResult}</p>}
          </div>
        );
      case CALCULATION_TYPES.DRIP_RATE:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">Drip Rate (gtts/min)</h3>
            <div>
              <Label htmlFor="totalVolume" className="font-medium text-sm text-gray-700 mb-1 block">Total Volume to Infuse (mL):</Label>
              <Input id="totalVolume" type="number" value={totalVolume} onChange={(e) => setTotalVolume(e.target.value)} placeholder="e.g., 1000" className="text-gray-900"/>
            </div>
            <div>
              <Label htmlFor="totalTime" className="font-medium text-sm text-gray-700 mb-1 block">Total Infusion Time (minutes):</Label>
              <Input id="totalTime" type="number" value={totalTime} onChange={(e) => setTotalTime(e.target.value)} placeholder="e.g., 60" className="text-gray-900"/>
            </div>
            <div>
              <Label htmlFor="dripSet" className="font-medium text-sm text-gray-700 mb-1 block">IV Drip Set:</Label>
              <Select value={dripSet} onValueChange={setDripSet} name="dripSet">
                <SelectTrigger id="dripSet"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DRIP_SETS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {dripRateResult && <p className="text-green-600 font-semibold pt-2 text-sm">Result: {dripRateResult}</p>}
          </div>
        );
      case CALCULATION_TYPES.CONVERSION_LBS_KG:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">Convert Pounds to Kilograms</h3>
            <div>
              <Label htmlFor="inputValueLbs" className="font-medium text-sm text-gray-700 mb-1 block">Weight in Pounds (lbs):</Label>
              <Input id="inputValueLbs" type="number" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Enter lbs" className="text-gray-900"/>
            </div>
            {conversionResult && <p className="text-green-600 font-semibold pt-2 text-sm">Result: {conversionResult}</p>}
          </div>
        );
      case CALCULATION_TYPES.CONVERSION_KG_LBS:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-3">Convert Kilograms to Pounds</h3>
            <div>
              <Label htmlFor="inputValueKg" className="font-medium text-sm text-gray-700 mb-1 block">Weight in Kilograms (kg):</Label>
              <Input id="inputValueKg" type="number" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Enter kg" className="text-gray-900"/>
            </div>
            {conversionResult && <p className="text-green-600 font-semibold pt-2 text-sm">Result: {conversionResult}</p>}
          </div>
        );
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white shadow-xl rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-800">Medication Calculator</DialogTitle>
          <DialogDescription className="text-sm text-gray-600">
            Select calculation type and enter values. Ensure all inputs are correct before use.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <Label className="font-medium text-sm text-gray-700 mb-1 block">Select Calculation Type:</Label>
            <Select value={calculationType} onValueChange={setCalculationType}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select Calculation Type" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value={CALCULATION_TYPES.WEIGHT_DOSE}>Weight-Based Dose</SelectItem>
                    <SelectItem value={CALCULATION_TYPES.DRIP_RATE}>Drip Rate (gtts/min)</SelectItem>
                    <SelectItem value={CALCULATION_TYPES.CONVERSION_LBS_KG}>Convert lbs to kg</SelectItem>
                    <SelectItem value={CALCULATION_TYPES.CONVERSION_KG_LBS}>Convert kg to lbs</SelectItem>
                </SelectContent>
            </Select>
            {error && (
                <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-md flex items-center text-sm">
                    <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                    <span>{error}</span>
                    <Button variant="ghost" size="sm" onClick={clearError} className="ml-auto p-0 h-auto text-red-700 hover:bg-red-200">
                        <X className="h-4 w-4"/>
                    </Button>
                </div>
            )}
            {renderInputs()}
        </div>
        <DialogFooter className="sm:justify-between gap-2 pt-4 border-t mt-4">
            <Button type="button" variant="outline" onClick={clearInputs} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                Clear Inputs
            </Button>
            <div className="flex gap-2">
                <DialogClose asChild>
                    <Button type="button" variant="ghost" onClick={onClose} className="text-gray-600 hover:bg-gray-100">
                        Close
                    </Button>
                </DialogClose>
                <Button type="button" onClick={handleCalculate} className="bg-blue-600 hover:bg-blue-700 text-white">
                    Calculate
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

