import pandas as pd
scored_conferences = pd.read_csv("Conference_Scores.csv")
testdf = pd.read_csv("test.csv")

testdf = testdf.rename(columns={"conference": "Acronym"})

final_df =pd.merge(scored_conferences, testdf, on=["Acronym"], how="left")

final_df.to_csv("ultimate_conference.csv", index=False)

