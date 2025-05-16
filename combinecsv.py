def merge_and_save_fuzzy_inner_dual_match():
    import difflib
    import pandas as pd
    def get_best_match(value, candidates, cutoff=0.85):
        if pd.isna(value):
            return None
        matches = difflib.get_close_matches(value, candidates, n=1, cutoff=cutoff)
        return matches[0] if matches else None

    try:
        scored_df = pd.read_csv("100conference.csv")
        extracted1_df = pd.read_csv("test.csv")
        
        print(extracted1_df.columns)
        extracted_df = extracted1_df.drop(" new_name", axis=1)
        
        titles = scored_df["Title"].dropna().unique()
        acronyms = scored_df["Acronym"].dropna().unique()

        # Try to match by Title
        extracted_df["Matched_Title"] = extracted_df["name"].apply(lambda x: get_best_match(x, titles))

        # Try to match by Acronym if title match failed
        extracted_df["Matched_Acronym"] = extracted_df.apply(
            lambda row: get_best_match(row["conference"], acronyms) if pd.isna(row["Matched_Title"]) else None,
            axis=1
        )

        # Prefer title match, fallback to acronym match
        extracted_df["Matched_Key"] = extracted_df["Matched_Title"].combine_first(extracted_df["Matched_Acronym"])

        # Merge on either Title or Acronym using inner join
        merged_on_title = pd.merge(
            scored_df, extracted_df[extracted_df["Matched_Title"].notna()],
            left_on="Title", right_on="Matched_Title", how="inner"
        )
        merged_on_acronym = pd.merge(
            scored_df, extracted_df[extracted_df["Matched_Acronym"].notna()],
            left_on="Acronym", right_on="Matched_Acronym", how="inner"
        )

        # Combine both matches, avoiding duplicates
        merged_df = pd.concat([merged_on_title, merged_on_acronym]).drop_duplicates(subset=["Title", "Acronym"])

        # Replace original values with updated ones
        merged_df["Title"] = merged_df["name"].combine_first(merged_df["Title"])
        merged_df["Acronym"] = merged_df["conference"].combine_first(merged_df["Acronym"])
        
        # Reorder columns
        cols = merged_df.columns.tolist()
        fixed_cols = ["Title", "Acronym", "url", "deadline", "notification"]
        final_cols = (
            [col for col in fixed_cols if col in cols] +
            [col for col in cols if col not in fixed_cols + ["Matched_Title", "Matched_Acronym", "Matched_Key", "name", "conference"]]
        )
        merged_df = merged_df[final_cols]

        # Save result
        merged_df.to_csv("merged_conferences.csv", index=False)
        print("Successfully saved merged_conferences.csv with fuzzy inner match.")
    except Exception as e:
        print(f" Error during merge: {e}")


merge_and_save_fuzzy_inner_dual_match()
