type ProviderFormSummary = {
  externalFormId: string;
  title: string;
  description?: string;
  responseCount: number;
};

type ListFormsPage = {
  items: ProviderFormSummary[];
  nextPageToken?: string;
};

type ListFormsInput = {
  accessToken: string;
  pageToken?: string;
};

type FormsLister = {
  listForms(input: ListFormsInput): Promise<ListFormsPage>;
};

export async function listAllProviderForms(
  lister: FormsLister,
  accessToken: string,
  maxPages: number = 20,
): Promise<{ items: ProviderFormSummary[]; hasMorePages: boolean }> {
  const allItems: ProviderFormSummary[] = [];
  const seenFormIds = new Set<string>();

  let nextPageToken: string | undefined;
  let pagesFetched = 0;
  let hasMorePages = false;

  do {
    const page = await lister.listForms({
      accessToken,
      pageToken: nextPageToken,
    });

    for (const item of page.items) {
      if (seenFormIds.has(item.externalFormId)) {
        continue;
      }

      seenFormIds.add(item.externalFormId);
      allItems.push(item);
    }

    nextPageToken = page.nextPageToken;
    pagesFetched += 1;
  } while (nextPageToken && pagesFetched < maxPages);

  if (nextPageToken) {
    hasMorePages = true;
  }

  return {
    items: allItems,
    hasMorePages,
  };
}
