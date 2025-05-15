"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from 'next/link';
import { useChat } from "ai/react";
import Fuse from 'fuse.js';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquare, Loader2, AlertCircle, Filter, XCircle, CalculatorIcon } from "lucide-react"; 
import protocolsData from "@/lib/protocols.json";
import { MedicationCalculator } from "@/components/MedicationCalculator";
import { useSearchParams, useRouter } from 'next/navigation';

interface Protocol {
  name: string;
  content: string;
  source_file: string;
  id: string;
  categories?: string[];
}

interface ProtocolData {
  [key: string]: Omit<Protocol, 'id' | 'categories'> & { categories?: string[] };
}

const protocolsList: Protocol[] = Object.entries(protocolsData as ProtocolData).map(([key, protocol]) => ({
    ...protocol,
    id: key,
    name: protocol.name || "Unnamed Protocol", 
    categories: protocol.categories || []
}));

const fuseOptions = {
  includeScore: true,
  threshold: 0.4,
  keys: [
    { name: 'name', weight: 0.6 },
    { name: 'id', weight: 0.5 },
    { name: 'content', weight: 0.2 }
  ]
};

const fuse = new Fuse(protocolsList, fuseOptions);

const CATEGORY_FILTERS = [
    { id: "adult", label: "Adult" },
    { id: "pediatric", label: "Pediatric" },
    { id: "medical", label: "Medical" },
    { id: "trauma", label: "Trauma" },
];

// Helper function to check for whole word boundaries
const isWholeWord = (text: string, index: number, length: number): boolean => {
    const charBefore = index > 0 ? text[index - 1] : ' ';
    const charAfter = index + length < text.length ? text[index + length] : ' ';
    // Boundary chars: whitespace, punctuation (except hyphen within words), start/end of string
    const boundaryChars = /[^a-zA-Z0-9-]/; // Allow hyphens within words
    const isStartBoundary = index === 0 || boundaryChars.test(charBefore);
    const isEndBoundary = (index + length === text.length) || boundaryChars.test(charAfter);
    // console.log(`MANUS DEBUG V8: isWholeWord check for text.substring(${index}, ${index + length})='${text.substring(index, index+length)}': charBefore='${charBefore}', charAfter='${charAfter}', isStartBoundary=${isStartBoundary}, isEndBoundary=${isEndBoundary}`);
    return isStartBoundary && isEndBoundary;
};

const linkifyContent = (content: string | undefined, allProtocols: Protocol[], currentProtocolId: string): (string | JSX.Element)[] => {
    console.log(`MANUS DEBUG V8: linkifyContent V8 (Enhanced Debug) CALLED for protocol ID: ${currentProtocolId}, content snippet: ${content ? content.substring(0, 70) + "..." : "N/A"}`);
    if (!content) return ["Content not available."];

    const potentialMatches: { index: number; length: number; id: string; title: string; originalMatch: string }[] = [];
    const lowerContent = content.toLowerCase(); // For case-insensitive search

    allProtocols.forEach(refProtocol => {
        if (refProtocol.id === currentProtocolId || !refProtocol.name || refProtocol.name.trim() === "") return;
        
        const lowerRefProtocolName = refProtocol.name.toLowerCase();
        if (lowerRefProtocolName.length === 0) return;
        // console.log(`MANUS DEBUG V8: linkifyContent - Checking for refProtocol: '${refProtocol.name}' (ID: ${refProtocol.id})`);

        let searchIndex = 0;
        while (searchIndex < lowerContent.length) {
            const foundIndex = lowerContent.indexOf(lowerRefProtocolName, searchIndex);
            if (foundIndex === -1) break; // No more occurrences of this title
            // console.log(`MANUS DEBUG V8: linkifyContent - Found potential match for '${refProtocol.name}' at index ${foundIndex} in content.`);

            if (isWholeWord(content, foundIndex, refProtocol.name.length)) {
                // console.log(`MANUS DEBUG V8: linkifyContent - Whole word match confirmed for '${refProtocol.name}' at index ${foundIndex}.`);
                potentialMatches.push({
                    index: foundIndex,
                    length: refProtocol.name.length, 
                    id: refProtocol.id,
                    title: refProtocol.name, 
                    originalMatch: content.substring(foundIndex, foundIndex + refProtocol.name.length)
                });
            } else {
                // console.log(`MANUS DEBUG V8: linkifyContent - Not a whole word match for '${refProtocol.name}' at index ${foundIndex}.`);
            }
            searchIndex = foundIndex + lowerRefProtocolName.length; 
        }
    });

    potentialMatches.sort((a, b) => {
        if (a.index !== b.index) {
            return a.index - b.index;
        }
        return b.length - a.length; 
    });

    const finalMatches: typeof potentialMatches = [];
    let lastMatchEndPosition = -1;
    for (const match of potentialMatches) {
        if (match.index >= lastMatchEndPosition) {
            finalMatches.push(match);
            lastMatchEndPosition = match.index + match.length;
        }
    }
    
    // console.log("MANUS DEBUG V8: linkifyContent - Final sorted & filtered matches:", finalMatches.map(m => ({title: m.title, index: m.index, original: m.originalMatch})));

    const result: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    finalMatches.forEach(match => {
        if (match.index > lastIndex) {
            result.push(content.substring(lastIndex, match.index));
        }
        // console.log(`MANUS DEBUG V8: linkifyContent - Creating link for: ${match.originalMatch} to ID ${match.id}`);
        result.push(
            <Link
                href={{ pathname: '/', query: { protocol: match.id } }}
                key={`${match.id}-${match.index}-${Math.random()}`}
                className="text-blue-600 hover:text-blue-800 underline"
                onClick={(e) => console.log(`MANUS DEBUG V8: Link clicked for protocol ID: ${match.id}, original text: '${match.originalMatch}'`)}
            >
                {match.originalMatch} 
            </Link>
        );
        lastIndex = match.index + match.length;
    });

    if (lastIndex < content.length) {
        result.push(content.substring(lastIndex));
    }
    // console.log("MANUS DEBUG V8: linkifyContent - Final result segments count:", result.length);
    return result.length > 0 ? result : [content]; // Ensure content is always returned even if no links
};

function ProtocolNavigatorPageContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Protocol[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);

  console.log("MANUS DEBUG V8: ProtocolNavigatorPageContent rendering/re-rendering. SelectedProtocol ID:", selectedProtocol?.id);

  const { messages, input, handleInputChange: handleChatInputChange, handleSubmit, isLoading: isChatLoading, error: chatError } = useChat({
    api: "/api/chat",
  });

  const applyFiltersAndSearch = useCallback(() => {
    console.log("MANUS DEBUG V8: applyFiltersAndSearch called. Term:", searchTerm, "Filters:", activeFilters);
    const protocolIdFromQuery = searchParams.get('protocol');
    if (protocolIdFromQuery && !searchTerm && activeFilters.length === 0) {
        console.log("MANUS DEBUG V8: applyFiltersAndSearch - bailing early due to protocolIdFromQuery and no search/filters");
        return; 
    }

    let filteredByCategories = protocolsList;
    if (activeFilters.length > 0) {
        filteredByCategories = protocolsList.filter(protocol => 
            activeFilters.every(filter => protocol.categories?.includes(filter))
        );
    }
    if (!searchTerm.trim()) {
      setSearchResults(filteredByCategories);
      setIsSearching(false);
      console.log("MANUS DEBUG V8: applyFiltersAndSearch - no search term, set results to filteredByCategories");
      return;
    }
    setIsSearching(true);
    const fuseInstance = new Fuse(filteredByCategories, fuseOptions);
    const results = fuseInstance.search(searchTerm);
    const finalResults = results.map(result => result.item);
    setSearchResults(finalResults);
    setIsSearching(false);
    console.log("MANUS DEBUG V8: applyFiltersAndSearch - search complete, results count:", finalResults.length);
  }, [searchTerm, activeFilters, searchParams]);

  useEffect(() => {
    const protocolIdFromQuery = searchParams.get('protocol');
    console.log("MANUS DEBUG V8: useEffect[searchParams] - protocolIdFromQuery:", protocolIdFromQuery);
    if (protocolIdFromQuery) {
        const foundProtocol = protocolsList.find(p => p.id === protocolIdFromQuery);
        console.log("MANUS DEBUG V8: useEffect[searchParams] - foundProtocol:", foundProtocol?.id);
        if (foundProtocol) {
            if (selectedProtocol?.id !== foundProtocol.id) {
                console.log("MANUS DEBUG V8: useEffect[searchParams] - Setting selected protocol to:", foundProtocol.id);
                setSelectedProtocol(foundProtocol);
            }
            setIsChatMode(false);
            // Only clear search results if we are actually navigating to a new protocol, not just re-rendering
            if (searchResults.length > 0) setSearchResults([]); 
            if (searchTerm) setSearchTerm(""); 
            if (activeFilters.length > 0) setActiveFilters([]);
        } else {
            console.warn("MANUS DEBUG V8: useEffect[searchParams] - Protocol ID from query not found, redirecting to home.");
            setSelectedProtocol(null);
            router.push('/');
        }
    } else {
        // Only set selectedProtocol to null if it's currently set
        if (selectedProtocol) {
            console.log("MANUS DEBUG V8: useEffect[searchParams] - No protocolIdFromQuery, clearing selectedProtocol.");
            setSelectedProtocol(null);
        }
        applyFiltersAndSearch();
    }
  }, [searchParams, router, applyFiltersAndSearch, selectedProtocol, searchTerm, searchResults.length, activeFilters.length]); // Added dependencies to try and stabilize

  const handleSearchTermChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    if (selectedProtocol) {
        console.log("MANUS DEBUG V8: handleSearchTermChange - Clearing selected protocol due to search term change.");
        router.push('/'); 
        setSelectedProtocol(null); 
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { 
        console.log("MANUS DEBUG V8: Enter key pressed in search.");
        // applyFiltersAndSearch is called by useEffect when searchTerm changes
    }
  };

  const toggleFilter = (filterId: string) => {
    setActiveFilters(prevFilters => 
        prevFilters.includes(filterId) 
            ? prevFilters.filter(id => id !== filterId) 
            : [...prevFilters, filterId]
    );
    if (selectedProtocol) {
        console.log("MANUS DEBUG V8: toggleFilter - Clearing selected protocol due to filter change.");
        router.push('/'); 
        setSelectedProtocol(null);
    }
  };

  const clearAllFilters = () => {
    setActiveFilters([]);
    if (selectedProtocol) {
        console.log("MANUS DEBUG V8: clearAllFilters - Clearing selected protocol.");
        router.push('/');
        setSelectedProtocol(null);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Render function for protocol content to ensure it's memoized if selectedProtocol doesn't change
  const renderProtocolContent = useCallback(() => {
    if (!selectedProtocol) return null;
    console.log("MANUS DEBUG V8: renderProtocolContent - Rendering content for:", selectedProtocol.id);
    try {
        return linkifyContent(selectedProtocol.content, protocolsList, selectedProtocol.id);
    } catch (error) {
        console.error("MANUS DEBUG V8: Error in linkifyContent during render:", error);
        return <div className="text-red-500">Error rendering protocol content. Please check console.</div>;
    }
  }, [selectedProtocol]);

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <Card className="w-full max-w-4xl shadow-xl rounded-lg overflow-hidden">
        <CardHeader className="text-center bg-gray-800 text-white p-6">
            <div className="flex justify-between items-center">
                <div className="w-10 h-10"></div> 
                <CardTitle className="text-3xl md:text-4xl font-bold">EMS Protocol Navigator</CardTitle>
                <Button variant="outline" size="icon" onClick={() => setIsCalculatorOpen(true)} title="Open Medication Calculator" className="bg-gray-700 hover:bg-gray-600 border-gray-600 text-white">
                    <CalculatorIcon className="h-5 w-5" />
                </Button>
            </div>
            <CardDescription className="text-gray-300 mt-1">Search protocols or use AI chat for assistance</CardDescription>
        </CardHeader>
        <CardContent className="p-6 bg-white">
            <div className="w-full flex items-center space-x-2 mb-4">
                <Input
                type="text"
                placeholder="Search protocols (e.g., cardiac arrest)..."
                value={searchTerm}
                onChange={handleSearchTermChange}
                onKeyDown={handleSearchKeyDown}
                className="flex-grow border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm text-gray-900"
                />
                <Button variant="outline" onClick={() => { setIsChatMode(!isChatMode); if (selectedProtocol) {router.push('/'); setSelectedProtocol(null);}}} title={isChatMode ? "Switch to Search View" : "Switch to AI Chat"} className="border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md">
                {isChatMode ? <Search className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />} <span className="ml-2 hidden sm:inline">{isChatMode ? "Search View" : "AI Chat"}</span>
                </Button>
            </div>

            {!isChatMode && !selectedProtocol && (
                <div className="mb-6 p-4 bg-gray-50 rounded-md border border-gray-200">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 mr-2"><Filter className="h-4 w-4 inline-block mr-1 mb-px"/>Filters:</span>
                        {CATEGORY_FILTERS.map(filter => (
                            <Button 
                                key={filter.id} 
                                variant={activeFilters.includes(filter.id) ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleFilter(filter.id)}
                                className={`rounded-full text-xs px-3 py-1 ${activeFilters.includes(filter.id) ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                            >
                                {filter.label}
                            </Button>
                        ))}
                        {activeFilters.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs text-red-500 hover:bg-red-50 rounded-full px-3 py-1">
                                <XCircle className="h-3 w-3 mr-1"/> Clear All
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <div className="w-full h-[60vh] flex flex-col">
                {isChatMode ? (
                <div className="h-full flex flex-col border border-gray-300 rounded-md shadow-inner">
                    <ScrollArea className="flex-grow p-4 bg-white" ref={chatContainerRef}>
                        {messages.map((msg) => (
                        <div key={msg.id} className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`p-3 rounded-lg shadow-md max-w-[80%] ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                        ))}
                        {chatError && (
                             <div className="flex justify-start mb-3">
                                <div className="bg-red-100 text-red-700 p-3 rounded-lg shadow-md inline-flex items-center max-w-[80%]">
                                    <AlertCircle className="inline-block h-4 w-4 mr-2 flex-shrink-0"/>
                                    <p className="text-sm whitespace-pre-wrap">Sorry, an error occurred: {chatError.message}</p>
                                </div>
                            </div>
                        )}
                        {isChatLoading && messages[messages.length -1]?.role === 'user' && (
                            <div className="flex justify-start mb-3">
                                <div className="bg-gray-200 text-gray-700 p-3 rounded-lg shadow-md inline-flex items-center">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Thinking...
                                </div>
                            </div>
                        )}
                    </ScrollArea>
                    <form onSubmit={handleSubmit} className="flex items-center space-x-2 p-3 border-t border-gray-200 bg-gray-50 rounded-b-md">
                        <Input
                        placeholder="Ask the AI about protocols..."
                        value={input}
                        onChange={handleChatInputChange}
                        disabled={isChatLoading}
                        className="flex-grow border-gray-300 focus:ring-blue-500 focus:border-blue-500 rounded-md shadow-sm text-gray-900"
                        />
                        <Button type="submit" disabled={isChatLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-700 text-white rounded-md">
                        {isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                        </Button>
                    </form>
                </div>
                ) : selectedProtocol ? (
                    <ScrollArea className="h-full border border-gray-300 rounded-md p-4 bg-gray-50 shadow-inner">
                        <Button onClick={() => { console.log("MANUS DEBUG V8: Back to Search Results button clicked."); router.push('/'); setSelectedProtocol(null);}} className="mb-4 bg-blue-600 hover:bg-blue-700 text-white">Back to Search Results</Button>
                        <Card key={selectedProtocol.id} className="shadow-md rounded-lg overflow-hidden">
                            <CardHeader className="bg-gray-100 p-4 border-b border-gray-200">
                                <CardTitle className="text-xl font-semibold text-blue-700">{selectedProtocol.name} <span className="text-sm text-gray-500 font-mono">({selectedProtocol.id})</span></CardTitle>
                                <CardDescription className="text-xs text-gray-500">Source: {selectedProtocol.source_file}</CardDescription>
                                {selectedProtocol.categories && selectedProtocol.categories.length > 0 && (
                                    <div className="mt-2">
                                        {selectedProtocol.categories.map(cat => (
                                            <span key={cat} className="inline-block bg-blue-100 text-blue-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full">
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent className="p-4 md:p-6 text-gray-800 text-sm md:text-base leading-relaxed whitespace-pre-line">
                                {renderProtocolContent()}
                            </CardContent>
                        </Card>
                    </ScrollArea>
                ) : (
                    <ScrollArea className="h-full border border-gray-300 rounded-md p-1 bg-gray-50 shadow-inner">
                        {isSearching ? (
                        <div className="flex justify-center items-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <p className="ml-2 text-gray-600">Searching...</p>
                        </div>
                        ) : searchResults.length > 0 ? (
                        searchResults.map((protocol) => (
                            <Card 
                                key={protocol.id} 
                                className="mb-3 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer rounded-lg border border-gray-200"
                                onClick={() => {
                                    console.log("MANUS DEBUG V8: Search result card clicked for protocol ID:", protocol.id);
                                    router.push(`/?protocol=${protocol.id}`);
                                    // setSelectedProtocol(protocol); // This will be handled by useEffect
                                }}
                            >
                            <CardHeader className="p-4">
                                <CardTitle className="text-lg font-semibold text-blue-700 hover:text-blue-800">{protocol.name}</CardTitle>
                                <CardDescription className="text-xs text-gray-500 font-mono mt-1">ID: {protocol.id} | Source: {protocol.source_file}</CardDescription>
                                {protocol.categories && protocol.categories.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {protocol.categories.map(cat => (
                                            <span key={cat} className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full border border-gray-300">
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </CardHeader>
                            </Card>
                        ))
                        ) : (
                        <div className="flex justify-center items-center h-full">
                            <p className="text-gray-500">No search results. Try different keywords or adjust filters.</p>
                        </div>
                        )}
                    </ScrollArea>
                )}
            </div>
        </CardContent>
      </Card>
      {isCalculatorOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <MedicationCalculator onClose={() => setIsCalculatorOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default function ProtocolNavigatorPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-blue-600" /> <p className="ml-3 text-xl">Loading Protocols...</p></div>}>
            <ProtocolNavigatorPageContent />
        </Suspense>
    );
}



